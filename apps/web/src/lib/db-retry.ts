import "server-only";

// postgres.js / network error codes that are transient connection failures:
// safe to retry because the query itself is fine; the socket was stale or the
// Neon compute was briefly unreachable (see apps/web/src/db/index.ts for why
// this happens on Vercel serverless). Anything not in this set (a real SQL
// error, a constraint violation) is rethrown immediately.
const TRANSIENT_CODES = new Set([
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "57P01", // admin_shutdown: server closed the connection
]);

const TRANSIENT_MESSAGE =
  /CONNECT_TIMEOUT|Connection (?:closed|ended|terminated|destroyed)|ECONNRESET|ETIMEDOUT|write EPIPE/i;

function isTransient(err: unknown): boolean {
  // Drizzle wraps the driver error as `Failed query: …` and hangs the original
  // postgres.js error off `.cause`, so check both the wrapper and the cause.
  const candidates: unknown[] = [err];
  if (err && typeof err === "object" && "cause" in err) {
    candidates.push((err as { cause?: unknown }).cause);
  }
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const code = (c as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;
    const msg = (c as { message?: unknown }).message;
    if (typeof msg === "string" && TRANSIENT_MESSAGE.test(msg)) return true;
  }
  return false;
}

/**
 * Run a DB operation, retrying only on transient connection errors with a short
 * backoff. Gives a serverless request the same resilience the inngest crons get
 * from their built-in `retries`, so a single stale-socket blip self-heals on the
 * next attempt instead of nuking the whole page render.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isTransient(err)) throw err;
      // 100ms, 300ms: long enough for postgres.js to drop the dead socket and
      // open a fresh one before the next attempt.
      await new Promise((resolve) => setTimeout(resolve, 100 * (i * 2 + 1)));
    }
  }
  throw lastErr;
}
