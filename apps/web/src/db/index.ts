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
const client = postgres(env().DATABASE_URL, { prepare: false });
export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };
