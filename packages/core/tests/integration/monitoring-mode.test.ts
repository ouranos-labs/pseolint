import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { auditSource } from "../../src/auditor.js";
import { writeState, readState, STATE_SCHEMA_VERSION, type RunState, type UrlStateEntry } from "../../src/state.js";
import { CORE_RULESET_VERSION } from "../../src/ruleset-version.js";

interface TestServerHandle {
  origin: string;
  fetched: string[];
  close: () => Promise<void>;
}

/**
 * Spin up a tiny HTTP server that serves a sitemap + per-URL HTML pages, and
 * records every URL it served so tests can assert which URLs the audit
 * actually fetched. Sitemap entries optionally carry a `<lastmod>` value so
 * tests can drive the change-driven monitoring matrix.
 */
async function startTestServer(opts: {
  pages: Record<string, string>;
  sitemapEntries: Array<{ path: string; lastmod?: string }>;
}): Promise<TestServerHandle> {
  const fetched: string[] = [];
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    fetched.push(url);
    if (url === "/sitemap.xml") {
      const port = (server.address() as { port: number }).port;
      const origin = `http://127.0.0.1:${port}`;
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        opts.sitemapEntries
          .map((e) => {
            const loc = `<loc>${origin}${e.path}</loc>`;
            const lastmod = e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : "";
            return `<url>${loc}${lastmod}</url>`;
          })
          .join("\n") +
        `\n</urlset>`;
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(xml);
      return;
    }
    if (url === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("User-agent: *\nAllow: /\n");
      return;
    }
    const html = opts.pages[url];
    if (html === undefined) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("<html><body>not found</body></html>");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    fetched,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const baseHtml = (title: string): string =>
  `<!doctype html><html><head>` +
  `<title>${title}</title>` +
  `<meta name="description" content="Description for ${title} that is long enough to exceed the minimum.">` +
  `</head><body><h1>${title}</h1>` +
  `<p>Body content for the ${title} page that has plenty of words to clear the thin-content threshold ` +
  `and to give the audit something substantive to evaluate without triggering an empty-body skip. ` +
  `Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>` +
  `</body></html>`;

const baseEntry = (overrides: Partial<UrlStateEntry> = {}): UrlStateEntry => ({
  contentHash: "sha256:placeholder",
  fetchedAt: new Date().toISOString(),
  status: 200,
  findingIds: [],
  findings: [],
  rulesetVersion: CORE_RULESET_VERSION,
  ...overrides,
});

const buildPriorState = (origin: string, urls: Record<string, UrlStateEntry>): RunState => ({
  version: STATE_SCHEMA_VERSION,
  lastRun: new Date().toISOString(),
  lastFullAuditAt: new Date().toISOString(),
  source: `${origin}/sitemap.xml`,
  renderMode: "static",
  rulesetVersion: CORE_RULESET_VERSION,
  urls,
  summary: { score: 0, totalFindings: 0, byCategory: {} },
});

describe("monitoring mode (auditor + planScrapeStrategy wiring)", () => {
  let workDir: string;
  let server: TestServerHandle;
  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "pseolint-monitoring-"));
  });
  afterEach(async () => {
    if (server) await server.close();
    await rm(workDir, { recursive: true, force: true });
  });

  it("auto-enters monitoring when prior state exists and skips unchanged URLs from the fetch", async () => {
    const fixedOldDate = "2026-04-01T00:00:00Z"; // older than any sitemap lastmod we use
    server = await startTestServer({
      pages: {
        "/": baseHtml("Home"),
        "/a": baseHtml("Page A"),
        "/b": baseHtml("Page B"),
      },
      sitemapEntries: [
        { path: "/", lastmod: fixedOldDate },
        { path: "/a", lastmod: fixedOldDate },
        { path: "/b", lastmod: fixedOldDate },
      ],
    });

    // Seed prior state where /a and /b were audited recently, with no findings,
    // and the sitemap lastmod is OLDER than fetchedAt — matrix should SKIP them.
    // / is intentionally absent from prior state — matrix should refetch it ("new").
    const recentFetch = new Date().toISOString();
    const statePath = join(workDir, "state.json");
    await writeState(statePath, buildPriorState(server.origin, {
      [`${server.origin}/a`]: baseEntry({ fetchedAt: recentFetch }),
      [`${server.origin}/b`]: baseEntry({ fetchedAt: recentFetch }),
    }));

    server.fetched.length = 0;

    await auditSource(`${server.origin}/sitemap.xml`, {
      state: { path: statePath },
      crawlDiscovery: false,
    });

    // The sitemap and robots.txt are always fetched; what we care about is
    // whether /a and /b — which the matrix marked as "unchanged" — were
    // touched. They must NOT appear in fetched.
    expect(server.fetched).not.toContain("/a");
    expect(server.fetched).not.toContain("/b");
    // The new URL must have been fetched.
    expect(server.fetched).toContain("/");
  });

  it("--mode=fresh forces full re-audit even with prior state (every candidate URL is fetched)", async () => {
    const fixedOldDate = "2026-04-01T00:00:00Z";
    server = await startTestServer({
      pages: {
        "/a": baseHtml("Page A"),
        "/b": baseHtml("Page B"),
      },
      sitemapEntries: [
        { path: "/a", lastmod: fixedOldDate },
        { path: "/b", lastmod: fixedOldDate },
      ],
    });

    // Same setup as the monitoring test: prior state covers both URLs and
    // the matrix WOULD skip them. mode=fresh must override that.
    const recentFetch = new Date().toISOString();
    const statePath = join(workDir, "state.json");
    await writeState(statePath, buildPriorState(server.origin, {
      [`${server.origin}/a`]: baseEntry({ fetchedAt: recentFetch }),
      [`${server.origin}/b`]: baseEntry({ fetchedAt: recentFetch }),
    }));

    server.fetched.length = 0;

    await auditSource(`${server.origin}/sitemap.xml`, {
      state: { path: statePath, mode: "fresh" },
      crawlDiscovery: false,
    });

    expect(server.fetched).toContain("/a");
    expect(server.fetched).toContain("/b");
  });

  it("monitoring mode does not bump fetchedAt on skipped URLs in the new state file", async () => {
    const fixedOldDate = "2026-04-01T00:00:00Z";
    server = await startTestServer({
      pages: { "/a": baseHtml("Page A") },
      sitemapEntries: [{ path: "/a", lastmod: fixedOldDate }],
    });

    const priorFetchedAt = "2026-04-25T12:00:00Z"; // recent enough to dodge the 7d age floor
    const statePath = join(workDir, "state.json");
    await writeState(statePath, buildPriorState(server.origin, {
      [`${server.origin}/a`]: baseEntry({ fetchedAt: priorFetchedAt }),
    }));

    await auditSource(`${server.origin}/sitemap.xml`, {
      state: { path: statePath },
      crawlDiscovery: false,
    });

    const after = await readState(statePath);
    expect(after).not.toBeNull();
    const entry = after!.urls[`${server.origin}/a`];
    expect(entry).toBeDefined();
    // The whole point of monitoring mode is that the skip evidence stays
    // honest — bumping fetchedAt on a skipped URL would mean the age floor
    // never triggers and silently-changed pages drift forever.
    expect(entry.fetchedAt).toBe(priorFetchedAt);
  });

  it("filesystem source ignores monitoring mode (always reads all files)", async () => {
    // Filesystem sources bypass the strategy: local reads are cheap and the
    // single-page reading code path doesn't need a pre-fetch decision matrix.
    // We assert this indirectly by checking that prior state with mode=monitoring
    // doesn't suppress reading the files (skippedUrls remains empty).
    const { mkdir, writeFile } = await import("node:fs/promises");
    const siteDir = join(workDir, "site");
    await mkdir(siteDir, { recursive: true });
    await writeFile(join(siteDir, "page.html"), baseHtml("Page"), "utf8");

    const statePath = join(workDir, "state.json");
    // Seed a state file with a fake URL — irrelevant to the file-based audit
    // but proves we don't try to apply the matrix.
    await writeState(statePath, buildPriorState("file:///fake", {
      "file:///fake/page.html": baseEntry({ fetchedAt: new Date().toISOString() }),
    }));

    const summary = await auditSource(siteDir, {
      state: { path: statePath, mode: "monitoring" },
    });

    // Filesystem audit always re-reads every HTML file. There's no scrapePlan
    // and no skipped-by-monitoring URLs.
    expect(summary.skippedUrls?.length ?? 0).toBe(0);
  });
});
