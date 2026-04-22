import { describe, it, expect } from "vitest";
import { createUploadToken, verifyUploadToken } from "@/lib/upload-token";

describe("upload token", () => {
  it("creates a token + hash pair where verify matches", async () => {
    const { token, hash } = await createUploadToken();
    expect(token).toMatch(/^pslt_[A-Za-z0-9_-]{40,}$/);
    expect(await verifyUploadToken(token, hash)).toBe(true);
  });

  it("verify rejects tampered tokens", async () => {
    const { token, hash } = await createUploadToken();
    expect(await verifyUploadToken(token + "x", hash)).toBe(false);
  });

  it("verify rejects malformed tokens", async () => {
    expect(await verifyUploadToken("not-a-token", "irrelevant")).toBe(false);
  });
});
