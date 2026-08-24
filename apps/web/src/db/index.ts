import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// postgres.js client (migrated off @neondatabase/serverless, 2026-06-05).
// `prepare: false` is required when DATABASE_URL points at Neon's POOLED
// endpoint (the "-pooler" host): PgBouncer in transaction mode does not support
// prepared statements. It's a safe no-op on a direct connection too, so we set
// it unconditionally. For serverless deploys, use the pooled connection string.
//
// Serverless connection tuning (2026-06-08): on Vercel the lambda freezes
// between invocations, so Neon's pooler / scale-to-zero compute drops the idle
// server connections postgres.js is holding. With the defaults (idle_timeout: 0
// = keep forever) the pool hands back DEAD sockets on the next request, and the
// reconnect storm: especially the /dashboard/[host] page firing ~10 queries at
// once: overruns the 30s connect timeout and surfaces as `CONNECT_TIMEOUT` →
// Drizzle `Failed query`. Dropping idle sockets and recycling connections keeps
// the pool from reusing anything Neon already closed.
const client = postgres(env().DATABASE_URL, {
  prepare: false,
  idle_timeout: 20, // seconds, close idle conns before Neon kills them
  max_lifetime: 60 * 10, // seconds, recycle long-lived conns
  connect_timeout: 15, // seconds, fail/recover faster than the 30s default
});
export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };
