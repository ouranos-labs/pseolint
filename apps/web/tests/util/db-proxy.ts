/**
 * The `@/db` redirect used by action suites, deliberately kept free of ANY
 * imports.
 *
 * A `vi.mock("@/db", ...)` factory has to reach this module, so anything this
 * file imports is pulled in while `@/db` is still mid-mock. Importing `@/db`
 * here (even transitively) closes that loop and hangs the vitest worker with no
 * error message: it exits unexpectedly partway through module init. Keep this
 * file importing nothing, and put everything that needs a database in
 * ./action-db.ts instead.
 */

/** The transaction the proxied `db` currently points at, or null for the real pool. */
export const active: { tx: unknown | null } = { tx: null };

/**
 * A stand-in for `db` that forwards to the active transaction when one is open,
 * and to the real pool otherwise.
 *
 * Methods are bound to their real target: Drizzle's query builders rely on
 * `this`, and an unbound `db.select` reached through a Proxy would receive the
 * Proxy itself.
 */
export function makeDbProxy(realDb: unknown): unknown {
  return new Proxy({} as Record<string | symbol, unknown>, {
    get(_t, prop) {
      const target = (active.tx ?? realDb) as Record<string | symbol, unknown>;
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
    has(_t, prop) {
      return Reflect.has((active.tx ?? realDb) as object, prop);
    },
  });
}
