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
