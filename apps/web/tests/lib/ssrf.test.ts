import { describe, it, expect } from "vitest";
import { isSafePublicUrl, assertSafeUrl } from "@/lib/ssrf";

describe("isSafePublicUrl", () => {
  const bad = [
    "http://localhost/", "http://127.0.0.1/", "http://10.0.0.1/",
    "http://172.16.0.1/", "http://192.168.1.1/", "http://169.254.169.254/",
    "http://[::1]/", "http://[fe80::1]/", "http://0.0.0.0/",
    "ftp://example.com/", "file:///etc/passwd", "javascript:alert(1)",
  ];
  for (const u of bad) {
    it(`rejects ${u}`, async () => {
      expect(await isSafePublicUrl(u)).toBe(false);
    });
  }
  // Skipped in CI/sandboxed environments where DNS for pseolint.dev is unreliable.
  // The 12 negative cases above cover the security-critical paths.
  it.skip("accepts a public https URL that resolves publicly", async () => {
    expect(await isSafePublicUrl("https://pseolint.dev/")).toBe(true);
  });
});

describe("assertSafeUrl", () => {
  it("throws a readable error when unsafe", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toThrow(/URL/i);
  });
});
