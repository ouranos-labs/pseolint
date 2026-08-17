// Test setup: ensures minimal env vars exist before any test module imports
// transitively load @/lib/env (e.g., via @/db -> env() at module load time).
// Tests that intentionally exercise env validation (env.test.ts) can still
// override these via process.env mutation + __resetEnvCache().
process.env.DATABASE_URL ??= "postgresql://user:pass@host/db";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.BETTER_AUTH_SECRET ??= "x".repeat(32);
process.env.RESEND_API_KEY ??= "re_testkey";
process.env.RESEND_FROM ??= "hello@example.com";
process.env.INNGEST_EVENT_KEY ??= "evt";
process.env.INNGEST_SIGNING_KEY ??= "sig";
process.env.R2_ACCOUNT_ID ??= "acc";
process.env.R2_ACCESS_KEY_ID ??= "akid";
process.env.R2_SECRET_ACCESS_KEY ??= "sec";
process.env.R2_BUCKET ??= "reports";
process.env.POLAR_ACCESS_TOKEN ??= "pol";
process.env.POLAR_WEBHOOK_SECRET ??= "whsec";
process.env.POLAR_MONTHLY_PRODUCT_ID ??= "prod_m";
process.env.POLAR_YEARLY_PRODUCT_ID ??= "prod_y";
process.env.TURNSTILE_SECRET_KEY ??= "ts_secret";
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??= "ts_site";
process.env.IP_HASH_SALT ??= "y".repeat(16);

// ---------------------------------------------------------------------------
// Stale fixture cleanup for DB-backed suites (RUN_DB_INTEGRATION_TESTS=1 only)
// ---------------------------------------------------------------------------
// The DB-backed suites seed users at `<random>@example.test` and clean up in
// afterEach. An interrupted run skips that, stranding fixture users in a real
// database — 16 such rows accumulated from two runs in April 2026 before this
// existed. They are inert (no dependent rows) but they inflate the user table.
//
// Deletes only fixtures created BEFORE this run started. Vitest executes files
// in parallel, so a blanket delete could rip out fixtures a sibling suite is
// still using; the timestamp guard scopes this to genuine leftovers and leaves
// the current run to its own afterEach. monitor-eligibility.test.ts needs none
// of this — it rolls its transactions back and commits nothing.
//
// Imports are dynamic so a normal `vitest run` never constructs a DB pool.
// (The `export {}` at the bottom makes this a module, which top-level await needs.)
if (process.env.RUN_DB_INTEGRATION_TESTS === "1") {
  const RUN_STARTED_AT = new Date();
  const { afterAll } = await import("vitest");
  afterAll(async () => {
    try {
      const [{ db }, { users }, { and, like, lt }] = await Promise.all([
        import("@/db"),
        import("@/db/schema"),
        import("drizzle-orm"),
      ]);
      const removed = await db
        .delete(users)
        .where(and(like(users.email, "%@example.test"), lt(users.createdAt, RUN_STARTED_AT)))
        .returning({ id: users.id });
      if (removed.length > 0) {
        console.log(`[db-integration] removed ${removed.length} stale fixture user(s)`);
      }
    } catch (err) {
      // Never fail a suite over cleanup — the rows are inert either way.
      console.warn(
        `[db-integration] stale fixture cleanup skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
}

export {};
