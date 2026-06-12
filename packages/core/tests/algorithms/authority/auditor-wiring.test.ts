import { describe, test, expect } from "vitest";
import { auditSource } from "../../../src/auditor.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function fixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "auth-wire-"));
  const html = (t: string) => `<html><head><title>${t}</title></head><body><h1>${t}</h1><p>${"word ".repeat(200)}</p></body></html>`;
  writeFileSync(join(dir, "a.html"), html("Alpha"));
  writeFileSync(join(dir, "b.html"), html("Beta"));
  writeFileSync(join(dir, "_manifest.json"), JSON.stringify({ "https://demo.test/a": "a.html", "https://demo.test/b": "b.html" }));
  return dir;
}

describe("authority wiring in auditSource", () => {
  test("a high-authority injected provider shifts the verdict leniently vs none", async () => {
    const dir = fixtureDir();
    const none = await auditSource(dir, { safeMode: "saas" });
    const high = await auditSource(dir, { safeMode: "saas", authorityScore: 95 });
    const rank = { ready: 0, caution: 1, concerning: 2, critical: 3 } as const;
    // explicit high authorityScore must not make the verdict stricter; for any non-ready verdict it is one tier more lenient.
    expect(rank[high.verdict as keyof typeof rank]).toBeLessThanOrEqual(rank[none.verdict as keyof typeof rank]);
    if (none.verdict !== "ready") {
      expect(rank[high.verdict as keyof typeof rank]).toBe(rank[none.verdict as keyof typeof rank] - 1);
    }
    expect(high.authority?.score).toBe(95);
  });
});
