import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { auditSource } from "../../src/auditor.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
  globalThis.fetch = originalFetch;
});

const originalFetch = globalThis.fetch;

describe("auditSource", () => {
  test("audits an html directory and emits relationship findings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-audit-"));
    tempDirs.push(dir);

    const sharedLongContent = Array.from(
      { length: 70 },
      () => "Step choose name file articles appoint agent submit report"
    ).join(" ");

    const pageA = `
      <html><body>
        <h1>California LLC Template</h1>
        <p>${sharedLongContent} California LLC filing guide with annual fee details.</p>
      </body></html>
    `;
    const pageB = `
      <html><body>
        <h1>Nevada LLC Template</h1>
        <p>${sharedLongContent} Nevada LLC filing guide with annual fee details.</p>
      </body></html>
    `;
    const pageThin = `<html><body><h1>Thin page</h1><p>tiny content only</p></body></html>`;

    await writeFile(join(dir, "california-llc.html"), pageA, "utf-8");
    await writeFile(join(dir, "nevada-llc.html"), pageB, "utf-8");
    await writeFile(join(dir, "thin.html"), pageThin, "utf-8");

    const summary = await auditSource(dir, {
      rules: { templateDiversityMinUniqueRatio: 0.8, boilerplateMaxRatio: 0.4 }
    });

    expect(summary.pageCount).toBe(3);
    expect(summary.findings.some((f) => f.ruleId === "spam/near-duplicate")).toBe(true);
    expect(summary.findings.some((f) => f.ruleId === "spam/entity-swap")).toBe(true);
    expect(summary.findings.some((f) => f.ruleId === "spam/thin-content")).toBe(true);
    expect(summary.findings.some((f) => f.ruleId === "spam/template-diversity")).toBe(true);
    expect(summary.score).toBeGreaterThan(0);
  });

  test("throws a clear error when source path does not exist", async () => {
    await expect(auditSource("D:/path/that/does/not/exist")).rejects.toThrow(
      "Unable to access source"
    );
  });

  test("expands sitemap urls and audits referenced pages", async () => {
    const pages: Record<string, string> = {
      "https://example.dev/page-a": `<html><body><h1>Page A</h1><p>${"alpha ".repeat(350)}</p></body></html>`,
      "https://example.dev/page-b": `<html><body><h1>Page B</h1><p>${"beta ".repeat(350)}</p></body></html>`
    };
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.dev/page-a</loc></url>
        <url><loc>https://example.dev/page-b</loc></url>
      </urlset>`;

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://example.dev/sitemap.xml") {
        return new Response(sitemap, { status: 200, headers: { "content-type": "application/xml" } });
      }

      const body = pages[url];
      if (!body) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;

    const summary = await auditSource("https://example.dev/sitemap.xml", {
      rules: { publicationVelocityMaxPerDay: 1 }
    });
    expect(summary.pageCount).toBe(2);
    expect(summary.findings.some((f) => f.ruleId === "spam/publication-velocity")).toBe(false);
  });

  test("emits audit/duplicate-url when normalized URLs repeat with different HTML", async () => {
    const pages: Record<string, string> = {
      "https://example.dev/dup-page": `<html><body><h1>First</h1><p>${"alpha ".repeat(350)}</p></body></html>`,
      "https://example.dev/dup-page?utm=1": `<html><body><h1>Second</h1><p>${"beta ".repeat(350)}</p></body></html>`
    };
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.dev/dup-page</loc></url>
        <url><loc>https://example.dev/dup-page?utm=1</loc></url>
      </urlset>`;

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://example.dev/sitemap-dup.xml") {
        return new Response(sitemap, { status: 200, headers: { "content-type": "application/xml" } });
      }
      const body = pages[url];
      if (!body) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;

    const summary = await auditSource("https://example.dev/sitemap-dup.xml");
    expect(summary.findings.some((f) => f.ruleId === "audit/duplicate-url")).toBe(true);
    expect(summary.pageCount).toBe(1);
  });

  test("expands sitemapindex recursively", async () => {
    const pages: Record<string, string> = {
      "https://example.dev/page-c": `<html><body><h1>Page C</h1><p>${"theta ".repeat(320)}</p></body></html>`,
      "https://example.dev/page-d": `<html><body><h1>Page D</h1><p>${"lambda ".repeat(320)}</p></body></html>`
    };
    const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.dev/nested.xml</loc></sitemap>
      </sitemapindex>`;
    const nestedSitemap = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.dev/page-c</loc></url>
        <url><loc>https://example.dev/page-d</loc></url>
      </urlset>`;

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://example.dev/sitemap-index.xml") {
        return new Response(sitemapIndex, {
          status: 200,
          headers: { "content-type": "application/xml" }
        });
      }
      if (url === "https://example.dev/nested.xml") {
        return new Response(nestedSitemap, {
          status: 200,
          headers: { "content-type": "application/xml" }
        });
      }
      const body = pages[url];
      if (!body) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;

    const summary = await auditSource("https://example.dev/sitemap-index.xml");
    expect(summary.pageCount).toBe(2);
  });

  test("throws a clear error for invalid non-html URL responses", async () => {
    globalThis.fetch = (async () => {
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;

    await expect(auditSource("https://example.dev/data.json")).rejects.toThrow(
      "does not look like HTML or sitemap XML"
    );
  });

  test("flags publication velocity spikes from shared publish dates", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-velocity-"));
    tempDirs.push(dir);

    const html = (title: string) => `
      <html>
        <head><meta property="article:published_time" content="2026-04-13" /></head>
        <body><h1>${title}</h1><p>${"gamma ".repeat(330)}</p></body>
      </html>`;

    await writeFile(join(dir, "a.html"), html("A"), "utf-8");
    await writeFile(join(dir, "b.html"), html("B"), "utf-8");
    await writeFile(join(dir, "c.html"), html("C"), "utf-8");

    const summary = await auditSource(dir, { rules: { publicationVelocityMaxPerDay: 2 } });
    expect(summary.findings.some((f) => f.ruleId === "spam/publication-velocity")).toBe(true);
  });

  test("flags content uniqueness, headings, and meta collisions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-content-"));
    tempDirs.push(dir);

    const duplicateMeta = "Generate your state LLC template quickly.";
    const pageA = `
      <html>
        <head>
          <title>California LLC Template</title>
          <meta name="description" content="${duplicateMeta}" />
        </head>
        <body>
          <h1>State LLC Template</h1>
          <h2>How It Works</h2>
          <p>${"shared flow ".repeat(350)}</p>
        </body>
      </html>`;
    const pageB = `
      <html>
        <head>
          <title>Nevada LLC Template</title>
          <meta name="description" content="${duplicateMeta}" />
        </head>
        <body>
          <h1>State LLC Template</h1>
          <h2>How It Works</h2>
          <p>${"shared flow ".repeat(350)}</p>
        </body>
      </html>`;

    await writeFile(join(dir, "ca.html"), pageA, "utf-8");
    await writeFile(join(dir, "nv.html"), pageB, "utf-8");

    const summary = await auditSource(dir);
    expect(summary.findings.some((f) => f.ruleId === "content/unique-value")).toBe(true);
    expect(summary.findings.some((f) => f.ruleId === "content/heading-uniqueness")).toBe(true);
    expect(summary.findings.some((f) => f.ruleId === "content/meta-uniqueness")).toBe(true);
  });

  test("flags orphan pages, dead ends, and deep links", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-links-"));
    tempDirs.push(dir);

    const indexHtml = `
      <html><body>
        <h1>Home</h1>
        <a href="./hub.html">Hub</a>
      </body></html>`;
    const hubHtml = `
      <html><body>
        <h1>Hub</h1>
        <a href="./deep-a.html">Deep A</a>
      </body></html>`;
    const deepAHtml = `
      <html><body>
        <h1>Deep A</h1>
        <a href="./deep-b.html">Deep B</a>
      </body></html>`;
    const deepBHtml = `
      <html><body>
        <h1>Deep B</h1>
        <a href="./deep-c.html">Deep C</a>
      </body></html>`;
    const deepCHtml = `<html><body><h1>Deep C</h1></body></html>`;
    const orphanHtml = `<html><body><h1>Orphan</h1></body></html>`;

    await writeFile(join(dir, "index.html"), indexHtml, "utf-8");
    await writeFile(join(dir, "hub.html"), hubHtml, "utf-8");
    await writeFile(join(dir, "deep-a.html"), deepAHtml, "utf-8");
    await writeFile(join(dir, "deep-b.html"), deepBHtml, "utf-8");
    await writeFile(join(dir, "deep-c.html"), deepCHtml, "utf-8");
    await writeFile(join(dir, "orphan.html"), orphanHtml, "utf-8");

    const summary = await auditSource(dir);
    expect(summary.findings.some((f) => f.ruleId === "links/orphan-pages")).toBe(true);
    expect(summary.findings.some((f) => f.ruleId === "links/dead-ends")).toBe(true);
    expect(summary.findings.some((f) => f.ruleId === "links/link-depth")).toBe(true);
  });

  test("flags isolated directory clusters and missing hubs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-cluster-"));
    tempDirs.push(dir);

    const dir1 = join(dir, "cluster-a");
    const dir2 = join(dir, "cluster-b");
    await mkdir(dir1, { recursive: true });
    await mkdir(dir2, { recursive: true });
    await writeFile(
      join(dir1, "a.html"),
      `<html><body><h1>A1</h1><a href="./b.html">B</a><p>${"x ".repeat(200)}</p></body></html>`,
      "utf-8"
    );
    await writeFile(
      join(dir1, "b.html"),
      `<html><body><h1>A2</h1><a href="./a.html">A</a><p>${"y ".repeat(200)}</p></body></html>`,
      "utf-8"
    );
    await writeFile(
      join(dir2, "c.html"),
      `<html><body><h1>B1</h1><a href="https://other.example/away">Away</a><p>${"z ".repeat(200)}</p></body></html>`,
      "utf-8"
    );

    const summary = await auditSource(dir);
    expect(summary.findings.some((f) => f.ruleId === "links/cluster-connectivity")).toBe(true);

    const hubDir = join(dir, "many-siblings");
    await mkdir(hubDir, { recursive: true });
    await writeFile(
      join(hubDir, "s0.html"),
      `<html><body><h1>S0</h1><p>${"s ".repeat(200)}</p></body></html>`,
      "utf-8"
    );
    await writeFile(
      join(hubDir, "s1.html"),
      `<html><body><h1>S1</h1><p>${"s ".repeat(200)}</p></body></html>`,
      "utf-8"
    );
    await writeFile(
      join(hubDir, "s2.html"),
      `<html><body><h1>S2</h1><p>${"s ".repeat(200)}</p></body></html>`,
      "utf-8"
    );
    await writeFile(
      join(hubDir, "s3.html"),
      `<html><body><h1>S3</h1><p>${"s ".repeat(200)}</p></body></html>`,
      "utf-8"
    );

    const hubSummary = await auditSource(dir);
    expect(hubSummary.findings.some((f) => f.ruleId === "links/hub-pages")).toBe(true);
  });

  test("emits technical SEO findings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-tech-"));
    tempDirs.push(dir);

    const indexHtml = `
      <html>
        <head>
          <title>Index</title>
          <meta name="robots" content="index,follow" />
        </head>
        <body>
          <a href="./state.html">State</a>
          <p>${"index ".repeat(250)}</p>
        </body>
      </html>`;
    const stateHtml = `
      <html>
        <head>
          <title>State</title>
          <meta name="description" content="State page" />
          <meta name="robots" content="noindex,follow" />
          <link rel="alternate" hreflang="en" href="https://example.dev/en/state" />
          <link rel="alternate" hreflang="en" href="https://example.dev/en/state-2" />
        </head>
        <body><p>${"state ".repeat(250)}</p></body>
      </html>`;

    await writeFile(join(dir, "index.html"), indexHtml, "utf-8");
    await writeFile(join(dir, "state.html"), stateHtml, "utf-8");

    const summary = await auditSource(dir);
    expect(summary.findings.some((f) => f.ruleId === "tech/canonical-consistency")).toBe(true);
    expect(summary.findings.some((f) => f.ruleId === "tech/canonical-noindex-conflict")).toBe(false);
    expect(summary.findings.some((f) => f.ruleId === "tech/robots-noindex-conflict")).toBe(true);
    expect(summary.findings.some((f) => f.ruleId === "tech/og-completeness")).toBe(true);
    expect(summary.findings.some((f) => f.ruleId === "tech/hreflang-consistency")).toBe(true);
  });

  test("checks robots and sitemap presence for URL audits", async () => {
    const html = `<html><head><title>X</title><link rel="canonical" href="https://example.dev/page" /></head><body><p>${"x ".repeat(300)}</p></body></html>`;
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://example.dev/page") {
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url === "https://example.dev/robots.txt") {
        return new Response("User-agent: *\nDisallow:", { status: 200, headers: { "content-type": "text/plain" } });
      }
      if (url === "https://example.dev/sitemap.xml") {
        return new Response("<urlset></urlset>", { status: 200, headers: { "content-type": "application/xml" } });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const summary = await auditSource("https://example.dev/page");
    expect(summary.findings.some((f) => f.ruleId === "tech/robots-sitemap-presence")).toBe(true);
  });
});
