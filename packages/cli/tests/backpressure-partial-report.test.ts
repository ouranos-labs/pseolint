/**
 * CLI behaviour around the backpressure partial-report salvage (Task B):
 *
 *   1. `localhostConcurrencyWarning` — pure helper that warns when a localhost
 *      target is crawled with concurrency > the dev preset's 1.
 *   2. End-to-end: when the engine returns a `truncated` summary (watchdog
 *      aborted mid-crawl but salvaged pages), the CLI still writes the report
 *      and exits 1, and prints a PARTIAL REPORT banner to stderr.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localhostConcurrencyWarning, runCli } from "../src/cli.js";

const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  await Promise.all(tempDirs.map((d) => rm(d, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("localhostConcurrencyWarning", () => {
  it("warns when a localhost target is crawled with concurrency > 1", () => {
    const w = localhostConcurrencyWarning("http://localhost:3000", 5);
    expect(w).not.toBeNull();
    expect(w).toMatch(/--concurrency 1/);
    expect(w).toMatch(/localhost|single-origin/i);
  });

  it("warns for 127.0.0.1 too", () => {
    expect(localhostConcurrencyWarning("http://127.0.0.1:8080/", 2)).not.toBeNull();
  });

  it("does not warn at concurrency 1 (the dev preset value)", () => {
    expect(localhostConcurrencyWarning("http://localhost:3000", 1)).toBeNull();
  });

  it("does not warn for non-localhost targets", () => {
    expect(localhostConcurrencyWarning("https://example.com", 10)).toBeNull();
  });

  it("does not warn when concurrency was left at default (undefined)", () => {
    expect(localhostConcurrencyWarning("http://localhost:3000", undefined)).toBeNull();
  });
});

describe("CLI partial-report on watchdog abort", () => {
  it("writes the report and exits 1 with a PARTIAL REPORT banner when the summary is truncated", async () => {
    const base = "https://degraded-cli.dev";
    const goodUrls = Array.from({ length: 12 }, (_, i) => `${base}/good-${i}`);
    const badUrls = Array.from({ length: 30 }, (_, i) => `${base}/bad-${i}`);
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${[...goodUrls, ...badUrls].map((u) => `<url><loc>${u}</loc></url>`).join("\n")}
      </urlset>`;
    const htmlBody = (t: string) =>
      `<html><head><title>${t}</title></head><body><h1>${t}</h1><p>${"content ".repeat(350)}</p></body></html>`;

    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      // Real fetch rejects once aborted — this makes the crawl actually stop.
      if (init?.signal?.aborted) {
        throw init.signal.reason ?? new DOMException("aborted", "AbortError");
      }
      if (url.endsWith("/sitemap.xml")) {
        return new Response(sitemap, { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (url.endsWith("/robots.txt") || url.endsWith("/llms.txt")) {
        return new Response("", { status: 404 });
      }
      if (url.startsWith(`${base}/good-`)) {
        return new Response(htmlBody(url), { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url.startsWith(`${base}/bad-`)) {
        return new Response("origin overloaded", { status: 503, headers: { "content-type": "text/html" } });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const dir = await mkdtemp(join(tmpdir(), "pseolint-cli-partial-"));
    tempDirs.push(dir);
    const outPath = join(dir, "report.json");

    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Silence the report stdout line ("Report written to ...").
    const stdout = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const exitCode = await runCli([
      `${base}/sitemap.xml`,
      "--format", "json",
      "--output", outPath,
      "--concurrency", "1",
      "--full", // skip the dev preset budget so the watchdog actually trips
    ]);

    // Incomplete run → non-zero exit so CI notices.
    expect(exitCode).toBe(1);

    // The report WAS written despite the abort.
    const written = await readFile(outPath, "utf-8");
    const report = JSON.parse(written);
    expect(report.truncated).toBe(true);
    expect(typeof report.truncatedReason).toBe("string");
    expect(report.truncatedReason.length).toBeGreaterThan(0);
    expect(report.pageCount).toBeGreaterThan(0);

    // The PARTIAL REPORT banner went to stderr.
    const stderrText = stderr.mock.calls.map((c) => String(c[0])).join("\n");
    expect(stderrText).toMatch(/PARTIAL REPORT/);
    expect(stderrText).toMatch(/coverage is incomplete/i);

    stdout.mockRestore();
    stderr.mockRestore();
  });
});
