import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { renderPages } from "../src/renderer.js";

// A trivial document that pulls one deliberately fat script. The HTML is tiny,
// so tech/html-size would stay silent: only Resource Timing sees the payload.
const PAGE = `<!doctype html><html><head><title>h</title></head><body>
<p>light html, heavy asset</p><script src="fat.js"></script></body></html>`;

function hasBrowser(): boolean {
  const override = process.env.PSEOLINT_BROWSER_EXECUTABLE;
  if (override) return existsSync(override);
  try {
    const pw = createRequire(import.meta.url)("playwright-core");
    return existsSync(pw.chromium.executablePath());
  } catch {
    return false;
  }
}

describe("renderPages resource timing (Node only)", () => {
  it.skipIf(!hasBrowser())("reports subresource bytes a static audit cannot see", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-res-"));
    try {
      await writeFile(join(dir, "index.html"), PAGE, "utf8");
      // ~600 KB of real JS: comfortably measurable, fast to serve locally.
      await writeFile(join(dir, "fat.js"), `globalThis.__x=${JSON.stringify("x".repeat(600_000))};`, "utf8");
      const out = await renderPages(
        [{ url: "http://local/index.html", localPath: "index.html" }],
        dir,
        { concurrency: 1, timeoutMs: 20000, analyticsMode: "allow" },
      );
      const res = out[0]?.resources;
      expect(res, "resources should be populated in render mode").toBeDefined();
      expect(res!.totalBytes).toBeGreaterThan(500_000);
      expect(res!.byKind.script).toBeGreaterThan(500_000);
      const fat = res!.largest.find((r) => r.url.endsWith("fat.js"));
      expect(fat, "the fat script should appear in largest[]").toBeDefined();
      expect(fat!.kind).toBe("script");
      // The whole point: the HTML itself is tiny.
      expect(out[0].html.length).toBeLessThan(5_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 40000);
});
