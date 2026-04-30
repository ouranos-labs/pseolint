/**
 * DB-integration suites need a real Postgres reachable via Neon serverless.
 * `tests/setup.ts` sets a placeholder DATABASE_URL so env validation passes for
 * suites that mock @/db; that placeholder is not connectable, so the four
 * DB-backed suites must be gated behind an explicit opt-in.
 *
 * Set RUN_DB_INTEGRATION_TESTS=1 with a real DATABASE_URL to run them locally.
 * CI defaults to skip — `bun run lint` still typechecks the files so signature
 * drift on `mergeFindings`, `evaluateAlertGate`, etc. is still caught.
 */
export const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION_TESTS === "1";
