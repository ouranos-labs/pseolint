import { afterEach, describe, expect, it } from "vitest";
import { __resetEnvCache, env } from "@/lib/env";

const MINIMAL: Record<string, string> = {
  DATABASE_URL: "postgresql://user:pass@host/db",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "x".repeat(32),
  RESEND_API_KEY: "re_testkey",
  RESEND_FROM: "hello@example.com",
  INNGEST_EVENT_KEY: "evt",
  INNGEST_SIGNING_KEY: "sig",
  R2_ACCOUNT_ID: "acc",
  R2_ACCESS_KEY_ID: "akid",
  R2_SECRET_ACCESS_KEY: "sec",
  R2_BUCKET: "reports",
  POLAR_ACCESS_TOKEN: "pol",
  POLAR_WEBHOOK_SECRET: "whsec",
  POLAR_MONTHLY_PRODUCT_ID: "prod_m",
  POLAR_YEARLY_PRODUCT_ID: "prod_y",
  TURNSTILE_SECRET_KEY: "ts_secret",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "ts_site",
  IP_HASH_SALT: "y".repeat(16),
};

function setEnv(extra: Record<string, string | undefined> = {}): void {
  for (const k of Object.keys(MINIMAL)) delete process.env[k];
  for (const [k, v] of Object.entries({ ...MINIMAL, ...extra })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  __resetEnvCache();
}

afterEach(() => __resetEnvCache());

describe("env()", () => {
  it("returns parsed env with minimal valid inputs", () => {
    setEnv();
    const e = env();
    expect(e.DATABASE_URL).toContain("postgresql://");
    expect(e.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it("throws on missing required vars", () => {
    setEnv({ DATABASE_URL: undefined });
    expect(() => env()).toThrow(/DATABASE_URL/);
  });

  it("throws on short secret", () => {
    setEnv({ BETTER_AUTH_SECRET: "short" });
    expect(() => env()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("caches the parse result", () => {
    setEnv();
    const a = env();
    const b = env();
    expect(a).toBe(b);
  });
});
