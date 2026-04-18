import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: "x" }, error: null }));

vi.mock("resend", () => ({
  Resend: vi.fn(function (this: { emails: { send: typeof sendMock } }) {
    this.emails = { send: sendMock };
  }),
}));

// Minimal env needed by @/lib/env when imported transitively
vi.hoisted(() => {
  const ENV_KEYS = {
    DATABASE_URL: "postgresql://x/y",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "x".repeat(32),
    RESEND_API_KEY: "re_test",
    RESEND_FROM: "test@example.com",
    INNGEST_EVENT_KEY: "e", INNGEST_SIGNING_KEY: "s",
    R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "a", R2_SECRET_ACCESS_KEY: "a", R2_BUCKET: "b",
    POLAR_ACCESS_TOKEN: "p", POLAR_WEBHOOK_SECRET: "w", POLAR_MONTHLY_PRODUCT_ID: "m", POLAR_YEARLY_PRODUCT_ID: "y",
    TURNSTILE_SECRET_KEY: "t", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "t",
    IP_HASH_SALT: "y".repeat(16),
  };
  for (const [k, v] of Object.entries(ENV_KEYS)) process.env[k] = v;
});

import { sendMagicLinkEmail } from "@/lib/resend";

describe("sendMagicLinkEmail", () => {
  beforeEach(() => sendMock.mockClear());

  it("renders template and calls resend.emails.send with expected shape", async () => {
    await sendMagicLinkEmail("user@example.com", "https://example.com/magic?token=abc");
    expect(sendMock).toHaveBeenCalledOnce();
    const arg = sendMock.mock.calls[0][0];
    expect(arg.to).toBe("user@example.com");
    expect(arg.subject).toContain("Sign in");
    expect(arg.html).toContain("abc");
  });
});
