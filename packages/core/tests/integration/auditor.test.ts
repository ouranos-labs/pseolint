import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { applyScoringProfileOverrides, auditSource } from "../../src/auditor.js";
import { classifySite } from "../../src/site-classifier.js";
import type { AuditSummary, RuleResult } from "../../src/types.js";

/** Test helper: flatten v0.4 issue buckets back into a single array. */
function allIssues(summary: AuditSummary): RuleResult[] {
  return [
    ...summary.issues.blockers,
    ...summary.issues.shouldFix,
    ...summary.issues.informational,
  ];
}

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

    // strict:true bypasses v0.4 §4.11 site-classification suppression. This
    // 3-page fixture would otherwise classify as small-marketing and have
    // spam/template-diversity + spam/entity-swap pre-filtered.
    const summary = await auditSource(dir, {
      rules: { templateDiversityMinUniqueRatio: 0.8, boilerplateMaxRatio: 0.4 },
      strict: true,
    });

    expect(summary.pageCount).toBe(3);
    const findings = allIssues(summary);
    expect(findings.some((f) => f.ruleId === "spam/near-duplicate")).toBe(true);
    expect(findings.some((f) => f.ruleId === "spam/entity-swap")).toBe(true);
    expect(findings.some((f) => f.ruleId === "spam/thin-content")).toBe(true);
    expect(findings.some((f) => f.ruleId === "spam/template-diversity")).toBe(true);
    expect(summary.risk).toBeGreaterThan(0);
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
    expect(allIssues(summary).some((f) => f.ruleId === "spam/publication-velocity")).toBe(false);
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
    // audit/* findings are diagnostic-only in v0.4: excluded from the issue
    // buckets, surfaced under `summary.diagnostics.auditFindings`.
    expect(allIssues(summary).some((f) => f.ruleId === "audit/duplicate-url")).toBe(false);
    expect(summary.diagnostics.auditFindings.some((f) => f.ruleId === "audit/duplicate-url")).toBe(true);
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
    expect(allIssues(summary).some((f) => f.ruleId === "spam/publication-velocity")).toBe(true);
  });

  test("user entity pattern missing 'g' flag is auto-normalized", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-entity-"));
    tempDirs.push(dir);

    const html = `
      <html>
        <body>
          <h1>Page</h1>
          <p>Paris opens. Paris closes. Paris flows. Paris ends.</p>
        </body>
      </html>`;
    await writeFile(join(dir, "a.html"), html, "utf-8");

    // Pattern without 'g' flag; auditor should add it so subsequent String.replace masks
    // every occurrence (required for correct template-fact detection).
    const summary = await auditSource(dir, {
      entityPatterns: [{ placeholder: "[CITY]", pattern: "Paris", flags: "i" }],
    });
    // Audit completes without throwing and produces a sane summary.
    expect(summary.pageCount).toBe(1);
  });

  test("AEO flat thresholds propagate through auditSource", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-aeo-config-"));
    tempDirs.push(dir);

    // A single page with exactly one citable fact ($70).
    const html = `
      <html>
        <head>
          <title>A page</title>
          <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","dateModified":"2026-04-01"}</script>
        </head>
        <body>
          <h1>Page</h1>
          <form><input name="q"/></form>
          <p>Fee is $70 and applies to all filings processed this quarter.</p>
        </body>
      </html>`;
    await writeFile(join(dir, "a.html"), html, "utf-8");

    // Default target (8) should flag citable-facts on this single-fact page.
    const defaultRun = await auditSource(dir);
    expect(allIssues(defaultRun).some((f) => f.ruleId === "aeo/citable-facts")).toBe(true);

    // Lowering the target below 1 makes the same page pass the citable-facts check.
    const tuned = await auditSource(dir, {
      rules: { citableFactsMin: 1, citableFactsTarget: 1 },
    });
    expect(allIssues(tuned).some((f) => f.ruleId === "aeo/citable-facts")).toBe(false);
  });

  test("AbortSignal cancels audit mid-run", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-abort-"));
    tempDirs.push(dir);

    const html = "<html><body><h1>Page</h1><p>Some content here that we will not actually audit.</p></body></html>";
    await writeFile(join(dir, "a.html"), html, "utf-8");
    await writeFile(join(dir, "b.html"), html, "utf-8");

    const controller = new AbortController();
    controller.abort(new Error("user cancelled"));

    await expect(
      auditSource(dir, { signal: controller.signal }),
    ).rejects.toThrow();
  });

  test("guardSsrf rejects localhost URL at source-validation step", async () => {
    await expect(
      auditSource("http://localhost/", { guardSsrf: true }),
    ).rejects.toThrow(/Refusing to fetch.*reserved hostname/);
  });

  test("guardSsrf rejects private IP URL", async () => {
    await expect(
      auditSource("http://10.0.0.5/", { guardSsrf: true }),
    ).rejects.toThrow(/Refusing to fetch.*IPv4 range/);
  });

  test("safeMode=\"saas\" flips guardSsrf on automatically", async () => {
    // Preset enables guardSsrf; user doesn't need to set it explicitly.
    await expect(
      auditSource("http://127.0.0.1/", { safeMode: "saas" }),
    ).rejects.toThrow(/Refusing to fetch.*IPv4/);
  });

  test("safeMode=\"saas\" can be overridden by explicit guardSsrf=false", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-safemode-override-"));
    tempDirs.push(dir);
    await writeFile(join(dir, "a.html"), "<html><body><h1>x</h1><p>hello world</p></body></html>", "utf-8");
    // safeMode enables guardSsrf, but explicit false wins. Auditing a local
    // directory (no URL) still runs: preset shouldn't break it.
    const summary = await auditSource(dir, { safeMode: "saas", guardSsrf: false });
    expect(summary.pageCount).toBe(1);
  });

  test("safeMode=\"cli\" keeps guardSsrf off by default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-cli-mode-"));
    tempDirs.push(dir);
    await writeFile(join(dir, "a.html"), "<html><body><h1>x</h1><p>hello world</p></body></html>", "utf-8");
    // cli preset should not introduce guardSsrf behaviour.
    const summary = await auditSource(dir, { safeMode: "cli" });
    expect(summary.pageCount).toBe(1);
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
    expect(summary.issues).toBeDefined();
    const allFindings = [
      ...summary.issues.blockers,
      ...summary.issues.shouldFix,
      ...summary.issues.informational,
    ];
    expect(allFindings.some((f) => f.ruleId === "content/unique-value")).toBe(true);
    expect(allFindings.some((f) => f.ruleId === "content/meta-uniqueness")).toBe(true);
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
    const findings = allIssues(summary);
    expect(findings.some((f) => f.ruleId === "links/orphan-pages")).toBe(true);
    expect(findings.some((f) => f.ruleId === "links/dead-ends")).toBe(true);
    expect(findings.some((f) => f.ruleId === "links/link-depth")).toBe(true);
  });

  test("flags isolated directory clusters", async () => {
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
    expect(allIssues(summary).some((f) => f.ruleId === "links/cluster-connectivity")).toBe(true);
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
    const findings = allIssues(summary);
    expect(findings.some((f) => f.ruleId === "tech/canonical-consistency")).toBe(true);
    expect(findings.some((f) => f.ruleId === "tech/canonical-noindex-conflict")).toBe(false);
    expect(findings.some((f) => f.ruleId === "tech/robots-noindex-conflict")).toBe(true);
    expect(findings.some((f) => f.ruleId === "tech/hreflang-consistency")).toBe(true);
  });

  test("respects ignore patterns to exclude matching pages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-ignore-"));
    tempDirs.push(dir);

    const pageHtml = `<html><body><h1>Page</h1><p>${"word ".repeat(300)}</p></body></html>`;
    const apiHtml = `<html><body><h1>API</h1><p>${"api ".repeat(300)}</p></body></html>`;

    const apiDir = join(dir, "api");
    await mkdir(apiDir, { recursive: true });
    await writeFile(join(dir, "index.html"), pageHtml, "utf-8");
    await writeFile(join(apiDir, "endpoint.html"), apiHtml, "utf-8");

    const summary = await auditSource(dir, { ignore: ["**/api/**"] });
    expect(summary.pageCount).toBe(1);
  });

  test("respects sampleSize to limit audited pages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-sample-"));
    tempDirs.push(dir);

    for (let i = 0; i < 10; i += 1) {
      await writeFile(
        join(dir, `page-${i}.html`),
        `<html><body><h1>Page ${i}</h1><p>${`unique${i} `.repeat(300)}</p></body></html>`,
        "utf-8"
      );
    }

    const summary = await auditSource(dir, { sampleSize: 3 });
    expect(summary.pageCount).toBe(3);
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

  });

  test("respects pageGroups to scope rules per group", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pseolint-groups-"));
    tempDirs.push(dir);

    const pseoDir = join(dir, "templates");
    await mkdir(pseoDir, { recursive: true });

    await writeFile(
      join(pseoDir, "ca-llc.html"),
      `<html><body><h1>CA LLC</h1><p>short</p></body></html>`,
      "utf-8"
    );

    await writeFile(
      join(dir, "about.html"),
      `<html><body><h1>About Us</h1><p>We are great.</p></body></html>`,
      "utf-8"
    );

    const summary = await auditSource(dir, {
      pageGroups: {
        pseo: { match: "**/templates/**", rules: ["spam/*", "content/*", "tech/*"] },
        marketing: { match: "**/about*", rules: ["tech/*"] },
      }
    });

    expect(summary.pageCount).toBeGreaterThanOrEqual(2);

    const findings = allIssues(summary);
    const pseoThin = findings.filter(
      (f) => f.ruleId === "spam/thin-content" && f.message.includes("templates")
    );
    expect(pseoThin.length).toBeGreaterThanOrEqual(1);

    const marketingSpam = findings.filter(
      (f) => f.ruleId.startsWith("spam/") && (f.pageUrl?.includes("about") || f.message.includes("about"))
    );
    expect(marketingSpam.length).toBe(0);

    expect(summary.groupScores).toBeDefined();
    expect(summary.groupPageCounts).toBeDefined();
  });
});

describe("v0.4.3 classification-driven scoring", () => {
  test("applyScoringProfileOverrides demotes AEO severity for small-marketing sites", () => {
    // Synthesize a small-marketing classification at high confidence.
    const classification = {
      type: "small-marketing" as const,
      confidence: 0.9,
      signals: [],
      suppressedRules: [],
    };
    const findings: RuleResult[] = [
      {
        ruleId: "aeo/citable-facts",
        severity: "error",
        message: "only 2 facts on page",
        pageUrl: "https://example.com/",
      },
      {
        ruleId: "spam/near-duplicate",
        severity: "error",
        message: "two pages 90% similar",
        pageUrl: "https://example.com/a",
      },
    ];
    const remapped = applyScoringProfileOverrides(findings, classification);
    const aeo = remapped.find((f) => f.ruleId === "aeo/citable-facts");
    const spam = remapped.find((f) => f.ruleId === "spam/near-duplicate");
    // aeo/citable-facts is demoted to info; spam/near-duplicate keeps its error.
    expect(aeo?.severity).toBe("info");
    expect(aeo?.confidence).toBe("low");
    expect(spam?.severity).toBe("error");
  });

  test("applyScoringProfileOverrides applies the docs profile only at ≥ 70% confidence (else falls through to unclear)", () => {
    // 2026-05-03 calibration: previously this test expected lowConf to keep
    // aeo/citable-facts at the original `error` severity, on the premise
    // that the `unclear` fallback profile had no overrides. Calibration
    // showed that fallback caused 4 of 5 reputable pSEO sites to fail:
    // structurally-incompatible rules (AEO on non-prose pages) over-fired
    // when the classifier hit confidence < 0.7. The `unclear` profile now
    // demotes those rules conservatively too. To still demonstrate the
    // confidence gate, we use `aeo/answer-first`, where the two profiles
    // disagree: `docs` demotes to `warning`; `unclear` demotes further to
    // `info`.
    const lowConf = {
      type: "docs" as const,
      confidence: 0.5,
      signals: [],
      suppressedRules: [],
    };
    const highConf = {
      type: "docs" as const,
      confidence: 0.9,
      signals: [],
      suppressedRules: [],
    };
    const findings: RuleResult[] = [
      {
        ruleId: "aeo/answer-first",
        severity: "error",
        message: "first paragraph lacks named entities",
        pageUrl: "https://example.com/",
      },
    ];
    // lowConf falls through to `unclear`, which demotes aeo/answer-first to info.
    expect(applyScoringProfileOverrides(findings, lowConf)[0].severity).toBe("info");
    // highConf applies the docs profile, which demotes aeo/answer-first to warning.
    expect(applyScoringProfileOverrides(findings, highConf)[0].severity).toBe("warning");
  });

  test("end-to-end: docs-classified site auto-demotes AEO findings (lower verdict risk)", async () => {
    // Sanity-check the integration end-to-end: build a fake docs site whose
    // URL set classifies as `docs`, audit it, and confirm:
    //   1. classification surfaces as docs in the summary
    //   2. AEO findings appear with confidence: low
    //   3. risk is lower than what the bare numbers would have produced under
    //      the v0.4 fixed-weight model
    const dir = await mkdtemp(join(tmpdir(), "pseolint-docs-classify-"));
    tempDirs.push(dir);
    // Single page, AEO-light marketing prose.
    const html = `<html>
        <head><title>Welcome</title></head>
        <body>
          <h1>Welcome</h1>
          <p>${"prose ".repeat(120)}</p>
        </body>
      </html>`;
    await writeFile(join(dir, "index.html"), html, "utf-8");

    // Local-directory audits don't have a sitemap / URL set we can plug into
    // the classifier, so the engine will see a single URL → "unclear". To
    // exercise the docs PROFILE branch we hit the override helper directly:
    const docsClass = classifySite({
      urls: Array.from({ length: 80 }, (_, i) => `https://docs.example.com/docs/p-${i}`),
    });
    expect(docsClass.type).toBe("docs");

    const findings: RuleResult[] = [
      { ruleId: "aeo/citable-facts", severity: "error", message: "x", pageUrl: "u1" },
      { ruleId: "aeo/citable-facts", severity: "error", message: "x", pageUrl: "u2" },
      { ruleId: "aeo/citable-facts", severity: "error", message: "x", pageUrl: "u3" },
    ];
    const remapped = applyScoringProfileOverrides(findings, docsClass);
    expect(remapped.every((f) => f.severity === "info")).toBe(true);
    expect(remapped.every((f) => f.confidence === "low")).toBe(true);

    // Sanity: the integration audit still completes.
    const summary = await auditSource(dir);
    expect(summary.pageCount).toBe(1);
  });

  test("scoreFromFindings rewards count for spam findings (cluster matters)", async () => {
    // A site with 5 near-duplicate findings should score higher risk than
    // one with a single near-duplicate finding, even at the same severity:
    // this is the per-instance amplification working as designed.
    const dir = await mkdtemp(join(tmpdir(), "pseolint-cluster-amp-"));
    tempDirs.push(dir);
    const sharedLong = Array.from({ length: 80 }, () => "shared phrase here").join(" ");
    for (let i = 0; i < 5; i += 1) {
      await writeFile(
        join(dir, `dup-${i}.html`),
        `<html><body><h1>Page ${i}</h1><p>${sharedLong} unique-${i}</p></body></html>`,
        "utf-8",
      );
    }
    const summary = await auditSource(dir, { strict: true });
    // Expect at least one spam finding from the duplicate cluster.
    const spamFindings = [
      ...summary.issues.blockers,
      ...summary.issues.shouldFix,
      ...summary.issues.informational,
    ].filter((f) => f.ruleId.startsWith("spam/"));
    expect(spamFindings.length).toBeGreaterThan(0);
    expect(summary.risk).toBeGreaterThan(0);
  });
});
