import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditSource } from "../../src/auditor.js";
import { readState } from "../../src/state.js";

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

  it("delta run on filesystem source preserves state entries (full re-read, no monitoring matrix applies)", async () => {
    // v0.5: filesystem sources bypass the change-driven monitoring matrix
    // (local reads are cheap). Every file is re-read on every run, but the
    // state file is rewritten with the same set of URLs, preserving coverage.
    const siteDir = join(dir, "site");
    await mkdir(siteDir, { recursive: true });
    const html = "<!doctype html><html><head><title>Stable Page</title><meta name=\"description\" content=\"This page never changes between audit runs.\"></head><body><h1>Stable</h1><p>Stable body content for the test.</p></body></html>";
    await writeFile(join(siteDir, "stable.html"), html, "utf8");
    await writeFile(join(siteDir, "other.html"), html.replace("Stable", "Other"), "utf8");
    const statePath = join(dir, "state.json");
    // Baseline run
    await auditSource(siteDir, { state: { path: statePath } });
    const before = await readState(statePath);
    expect(before).not.toBeNull();
    const stableBefore = Object.keys(before!.urls).find((u) => u.includes("stable"));
    expect(stableBefore).toBeDefined();
    // Delta run: filesystem source, --since alias maps to monitoring mode but
    // filesystem path is exempt, so all files are read again. The state file
    // must still contain every URL after the run.
    await auditSource(siteDir, { state: { path: statePath, since: true } });
    const after = await readState(statePath);
    expect(after).not.toBeNull();
    expect(Object.keys(after!.urls).length).toBe(Object.keys(before!.urls).length);
    expect(after!.urls[stableBefore!]).toBeDefined();
  });
});
