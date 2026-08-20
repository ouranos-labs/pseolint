import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMagicLinkEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/resend", () => ({ sendMagicLinkEmail }));

import { deliverMagicLink } from "@/lib/magic-link-delivery";

describe("deliverMagicLink", () => {
  beforeEach(() => sendMagicLinkEmail.mockReset());

  it("sends the email and does not throw on success", async () => {
    sendMagicLinkEmail.mockResolvedValueOnce(undefined);
    await expect(
      deliverMagicLink("user@example.com", "https://example.com/magic?token=abc"),
    ).resolves.toBeUndefined();
    expect(sendMagicLinkEmail).toHaveBeenCalledWith(
      "user@example.com",
      "https://example.com/magic?token=abc",
    );
  });

  it("maps a delivery failure to a 502 APIError, not a leaky 500", async () => {
    // Simulate Resend's unverified-domain rejection, which sendMagicLinkEmail
    // rethrows in production. (mockRejectedValueOnce, not the persistent
    // variant: a mock left armed to reject is flagged as an unhandled error
    // by vitest once deliverMagicLink swallows it.)
    sendMagicLinkEmail.mockRejectedValueOnce(
      new Error("Resend failed: You can only send testing emails to your own email address"),
    );

    let err: { constructor: { name: string }; statusCode?: number; message?: string } | undefined;
    try {
      await deliverMagicLink("user@example.com", "https://example.com/magic");
    } catch (e) {
      err = e as typeof err;
    }

    // Better Auth surfaces a thrown APIError with its status; an unmapped
    // throw would be an opaque 500 instead. (Asserting on shape rather than
    // `instanceof` avoids dual better-auth resolution under vitest.)
    expect(err?.constructor.name).toBe("APIError");
    expect(err?.statusCode).toBe(502);
    // User-facing message is clean and actionable; it must NOT leak the
    // underlying Resend reason.
    expect(err?.message).toContain("couldn't send your sign-in email");
    expect(err?.message).not.toContain("Resend");
    expect(err?.message).not.toContain("testing emails");
  });
});
