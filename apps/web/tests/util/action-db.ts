/**
 * Harness for running dashboard server actions against a REAL Postgres, inside
 * a transaction that is always rolled back.
 *
 * Why real SQL rather than another hand-written db mock: every destructive
 * action is guarded by a `where(... eq(table.userId, session.user.id))` clause,
 * and that clause IS the security boundary. A mock reimplements the scoping in
 * JavaScript and then asserts its own reimplementation, which passes just as
 * happily when the real predicate is missing. Only a database can answer
 * whether the SQL actually scopes.
 *
 * The actions import `db` at module scope and take no transaction parameter, so
 * the proxy in ./db-proxy.ts redirects that import at the active transaction.
 * Wire it from a `vi.mock("@/db", ...)` factory:
 *
 *   vi.mock("@/db", async (importOriginal) => {
 *     const actual = await importOriginal<typeof import("@/db")>();
 *     const { makeDbProxy } = await import("../util/db-proxy");
 *     return { ...actual, db: makeDbProxy(actual.db) };
 *   });
 *
 * Import `makeDbProxy` from ./db-proxy directly in that factory, NOT from this
 * module: this one imports `@/db`, which would deadlock the worker mid-mock.
 *
 * SAFETY: nothing commits. `withRollback` throws a sentinel after the body so
 * Drizzle unwinds the transaction, matching the pattern established by
 * monitor-eligibility.test.ts. That is what makes these suites safe to point at
 * a live database: the fixtures include deleting whole users, and a committed
 * one would be real data loss rather than an untidy row.
 */
import { db } from "@/db";
import { users } from "@/db/schema";
import { active } from "./db-proxy";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Sentinel that unwinds the transaction without failing the test. */
const ROLLBACK = Symbol("rollback");

export interface ActionContext {
  tx: Tx;
  /** Distinct user ids seeded for this case, in request order. */
  users: string[];
}

/**
 * Seeds `userCount` users, opens a transaction, points the proxied `db` at it,
 * runs `fn`, then always rolls back.
 *
 * Ids are randomised per case so concurrent vitest files cannot collide, and
 * emails use the reserved `.test` TLD (RFC 6761) so tests/setup.ts can sweep
 * anything a crash strands.
 */
export async function withRollback(
  userCount: number,
  fn: (ctx: ActionContext) => Promise<void>,
): Promise<void> {
  const ids = Array.from(
    { length: userCount },
    (_, i) => `test_${Math.random().toString(36).slice(2, 10)}_${i}`,
  );
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values(
        ids.map((id) => ({
          id,
          name: id,
          email: `${id}@example.test`,
          emailVerified: false,
        })),
      );
      active.tx = tx;
      try {
        await fn({ tx, users: ids });
      } finally {
        // Restore before unwinding so a failed case can't leak a dead
        // transaction into the next one via the module-level proxy.
        active.tx = null;
      }
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
}
