import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditSource } from "../../src/auditor.js";

describe("auditor + cache integration", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-auditor-cache-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("attaches cacheStats when cache option is provided", async () => {
    const siteDir = join(dir, "site");
    await mkdir(siteDir, { recursive: true });
    await writeFile(
      join(siteDir, "index.html"),
      "<!doctype html><html><head><title>Home</title><meta name=\"description\" content=\"A sample homepage for testing.\"></head><body><h1>Home</h1><p>Welcome to the home page of the test site.</p></body></html>",
      "utf8"
    );
    const cacheDir = join(dir, "cache");
    const result = await auditSource(siteDir, { cache: { dir: cacheDir } });
    expect(result.cacheStats).toBeDefined();
    expect(result.cacheStats?.total).toBeGreaterThanOrEqual(0);
  });

  it("omits cacheStats when cache option is absent", async () => {
    const siteDir = join(dir, "site");
    await mkdir(siteDir, { recursive: true });
    await writeFile(
      join(siteDir, "index.html"),
      "<!doctype html><html><head><title>Home</title><meta name=\"description\" content=\"Description.\"></head><body><h1>Home</h1><p>Body.</p></body></html>",
      "utf8"
    );
    const result = await auditSource(siteDir);
    expect(result.cacheStats).toBeUndefined();
  });
});
