import { describe, it, expect } from "vitest";
import { isSafePublicUrl } from "@/lib/ssrf";

describe("SSRF smoke — bypass attempts rejected", () => {
  const targets = [
    "http://169.254.169.254/latest/meta-data/",   // AWS metadata
    "http://metadata.google.internal/",            // GCP metadata
    "http://169.254.170.2/",                       // ECS/Fargate metadata
    "http://[::1]:80/",
    "http://127.1/",
    "http://0x7f000001/",
    "http://2130706433/",
    "gopher://example.com/",
    "file:///etc/shadow",
    "dict://localhost:22/",
    "ftp://internal.corp/",
  ];
  for (const t of targets) {
    it(`rejects ${t}`, async () => {
      expect(await isSafePublicUrl(t)).toBe(false);
    });
  }
});
