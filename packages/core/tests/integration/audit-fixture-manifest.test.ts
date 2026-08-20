/**
 * v0.5.15: fixture manifest (_manifest.json) directory loading.
 *
 * Verifies that when auditSource is given a directory path containing a
 * _manifest.json, it loads pages with their original URLs (not file paths),
 * allowing all URL-dependent rules to work correctly against disk fixtures.
 *
 * Tests use a real temp directory on the filesystem: no network calls.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditSource } from "../../src/auditor.js";

// ---- helpers ---------------------------------------------------------------

const RICH_HTML = (title: string, body: string, canonicalUrl?: string) => {
  const canonicalTag = canonicalUrl
    ? `<link rel="canonical" href="${canonicalUrl}" />`
    : "";
  return `<html><head><title>${title}</title>${canonicalTag}</head><body><h1>${title}</h1><p>${body}</p></body></html>`;
};

const WORD_FILL = (word: string, n = 300) => Array.from({ length: n }, () => word).join(" ");

// ---- test fixture setup ----------------------------------------------------

let fixtureDir: string;

beforeEach(async () => {
  fixtureDir = join(tmpdir(), `pseolint-fixture-test-${Date.now()}`);
  await mkdir(fixtureDir, { recursive: true });
});

afterEach(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

// ---- tests -----------------------------------------------------------------

describe("fixture manifest (_manifest.json) directory loading", () => {
  test("loads pages with original URLs when _manifest.json is present", async () => {
    const originalUrlA = "https://example.com/page-a";
    const originalUrlB = "https://example.com/page-b";

    await writeFile(join(fixtureDir, "page-a.html"), RICH_HTML("Page A", WORD_FILL("alpha")), "utf-8");
    await writeFile(join(fixtureDir, "page-b.html"), RICH_HTML("Page B", WORD_FILL("beta")), "utf-8");
    await writeFile(
      join(fixtureDir, "_manifest.json"),
      JSON.stringify({ [originalUrlA]: "page-a.html", [originalUrlB]: "page-b.html" }, null, 2),
      "utf-8"
    );

    const summary = await auditSource(fixtureDir);

    expect(summary.pageCount).toBe(2);
    const auditedUrls = summary.auditedUrls ?? [];
    expect(auditedUrls).toContain(originalUrlA);
    expect(auditedUrls).toContain(originalUrlB);
    // Must NOT contain the raw file paths
    expect(auditedUrls.some((u) => u.includes(fixtureDir))).toBe(false);
  });

  test("falls back to file-path URLs when no _manifest.json is present", async () => {
    await writeFile(join(fixtureDir, "page-a.html"), RICH_HTML("Page A", WORD_FILL("alpha")), "utf-8");
    await writeFile(join(fixtureDir, "page-b.html"), RICH_HTML("Page B", WORD_FILL("beta")), "utf-8");
    // No _manifest.json written

    const summary = await auditSource(fixtureDir);

    expect(summary.pageCount).toBe(2);
    // URLs will be absolute file paths (existing behaviour)
    const auditedUrls = summary.auditedUrls ?? [];
    expect(auditedUrls.some((u) => u.includes("page-a.html") || u.includes("page-b.html"))).toBe(true);
  });

  test("manifest missing a file: only successfully loaded pages appear in results", async () => {
    const urlA = "https://example.com/exists";
    const urlB = "https://example.com/missing";

    await writeFile(join(fixtureDir, "exists.html"), RICH_HTML("Exists", WORD_FILL("content")), "utf-8");
    // missing.html is intentionally not created
    await writeFile(
      join(fixtureDir, "_manifest.json"),
      JSON.stringify({ [urlA]: "exists.html", [urlB]: "missing.html" }, null, 2),
      "utf-8"
    );

    // Should throw because readFile on a missing file rejects.
    // The engine propagates the error (fail-loud for fixture mode).
    await expect(auditSource(fixtureDir)).rejects.toThrow();
  });

  test("empty manifest produces zero-page audit without throwing", async () => {
    await writeFile(
      join(fixtureDir, "_manifest.json"),
      JSON.stringify({}, null, 2),
      "utf-8"
    );

    const summary = await auditSource(fixtureDir);
    expect(summary.pageCount).toBe(0);
  });

  test("deterministic: two runs of the same fixture directory produce identical pageCount and verdicts", async () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://example.com/page-${i}`);
    const manifest: Record<string, string> = {};
    for (const [i, url] of urls.entries()) {
      const fname = `page-${i}.html`;
      await writeFile(join(fixtureDir, fname), RICH_HTML(`Page ${i}`, WORD_FILL(`word${i}`)), "utf-8");
      manifest[url] = fname;
    }
    await writeFile(join(fixtureDir, "_manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

    const run1 = await auditSource(fixtureDir);
    const run2 = await auditSource(fixtureDir);

    expect(run2.pageCount).toBe(run1.pageCount);
    expect(run2.verdict).toBe(run1.verdict);
    expect(run2.risk).toBe(run1.risk);
  });
});
