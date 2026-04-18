import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import * as schema from "./schema";

const pool = new Pool({ connectionString: env().DATABASE_URL });
export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
