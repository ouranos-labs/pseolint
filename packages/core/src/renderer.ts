import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, extname } from "node:path";
import { isAnalyticsRequest, type AnalyticsMode } from "./analytics-blocklist.js";

/**
 * Distinct User-Agent for rendered audits. Includes the standard `+URL` bot
 * marker so server-side analytics filters (GA4, Matomo, Cloudflare) can drop
 * it automatically, and keeps the `compatible` token so sites that sniff real
 * browsers for feature gating still serve content. The version is read from
 * package.json at module load so it stays accurate across releases.
 */
const RENDER_VERSION = (() => {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return pkg.version ?? "0";
  } catch {
    return "0";
  }
})();
const RENDER_USER_AGENT = `Mozilla/5.0 (compatible; pseolint-render/${RENDER_VERSION}; +https://pseolint.dev/bot)`;

/**
 * Playwright resource types that can carry analytics beacons. CSS, fonts,
 * images, and media typically don't: skipping them keeps the route handler
 * off most subresource requests and preserves Playwright's fast path.
 */
const INTERCEPTED_RESOURCE_TYPES = new Set([
  "document",
  "script",
  "xhr",
  "fetch",
  "websocket",
  "eventsource",
  "ping",
  "other", // navigator.sendBeacon shows up as "other" in some Playwright versions
]);

export interface RenderOptions {
  browserWsEndpoint?: string;
  /**
   * Path to a Chromium executable to launch instead of the binary Playwright
   * downloaded for its own pinned build. Falls back to the
   * `PSEOLINT_BROWSER_EXECUTABLE` env var. Lets environments with a system /
   * pre-provisioned Chromium (containers, CI images) run render mode without
   * a `playwright install` step. Ignored when `browserWsEndpoint` connects to
   * a remote browser instead of launching one.
   */
  browserExecutablePath?: string;
  concurrency: number;
  timeoutMs: number;
  /**
   * How to handle analytics / telemetry / session-replay beacons.
   *   "block" (default): abort known analytics hosts (Google Analytics, Plausible,
   *     Mixpanel, Hotjar, PostHog, Sentry, etc.). Prevents the audit from injecting
   *     fake pageviews / sessions into the site owner's dashboards.
   *   "allow-first-party": block third-party analytics only; keep same-origin
   *     requests for sites that self-host analytics on their own domain.
   *   "allow": don't intercept anything. Use this only when you're auditing a
   *     site you own and explicitly want render-mode traffic in your analytics.
   */
  analyticsMode?: AnalyticsMode;
  /** Extra host tokens to block in addition to the default list (substring match). */
  extraBlockedHosts?: readonly string[];
}

interface WebVitals {
  lcp: number | null;
  cls: number | null;
  ttfb: number | null;
}

interface RenderedPage {
  url: string;
  html: string;
  webVitals?: WebVitals;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPlaywright(): Promise<any> {
  try {
    // @ts-ignore -- playwright-core is an optional peer dependency
    return await import("playwright-core");
  } catch {
    throw new Error(
      "--render requires a browser connection.\n" +
      "  Option 1: Set PSEOLINT_BROWSER_WS to your CDP endpoint (wss://...)\n" +
      "  Option 2: Install playwright-core and Chromium:\n" +
      "    npm install playwright-core\n" +
      "    npx playwright install chromium"
    );
  }
}

function isLocalhost(endpoint: string): boolean {
  try {
    const parsed = new URL(endpoint);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const WS_SECURE = "wss://";
const WS_PLAIN = "ws" + "://";

function validateWsEndpoint(endpoint: string): void {
  if (endpoint.startsWith(WS_SECURE)) return;
  if (endpoint.startsWith(WS_PLAIN) && isLocalhost(endpoint)) return;
  throw new Error(
    `Insecure WebSocket endpoint: ${endpoint}. ` +
    `Remote endpoints must use ${WS_SECURE}. ` +
    `Unencrypted ${WS_PLAIN} is only allowed for localhost.`
  );
}

async function startStaticServer(rootDir: string): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const urlPath = decodeURIComponent(req.url ?? "/");
      const filePath = join(rootDir, urlPath);
      try {
        const content = await readFile(filePath);
        const ext = extname(filePath);
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ port, close: () => server.close() });
    });
  });
}

export async function renderPages(
  pages: Array<{ url: string; localPath?: string }>,
  sourceDir: string | null,
  options: RenderOptions
): Promise<RenderedPage[]> {
  const pw = await loadPlaywright();

  const endpoint = options.browserWsEndpoint
    ?? process.env.PSEOLINT_BROWSER_WS
    ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any;
  if (endpoint) {
    validateWsEndpoint(endpoint);
    browser = await pw.chromium.connectOverCDP(endpoint);
  } else {
    const executablePath = options.browserExecutablePath
      ?? process.env.PSEOLINT_BROWSER_EXECUTABLE
      ?? undefined;
    browser = await pw.chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  }

  // One browser context carries the UA + privacy headers + init script for every
  // audited page. `Sec-GPC` signals privacy-respecting analytics stacks to skip
  // collection (DNT is kept for legacy consumers but is deprecated and mostly
  // ignored today). `window.__pseolint_audit` lets cooperating sites
  // short-circuit their own analytics bootloader.
  const context = await browser.newContext({
    userAgent: RENDER_USER_AGENT,
    extraHTTPHeaders: {
      "DNT": "1",
      "Sec-GPC": "1",
    },
  });
  await context.addInitScript(() => {
    // @ts-ignore -- evaluated in the browser, window is the page's window
    const w = window as unknown as Record<string, unknown>;
    w.__pseolint_audit = true;
    // Core Web Vitals: install observers BEFORE page scripts run so no entries
    // are missed. LCP takes the last (largest) entry; CLS sums layout shifts
    // that weren't triggered by user input. Both use buffered:true so entries
    // dispatched before the observer attaches are still delivered.
    w.__pseolint_vitals = { lcp: null, cls: 0 };
    const v = w.__pseolint_vitals as { lcp: number | null; cls: number };
    try {
      // @ts-ignore -- PerformanceObserver is a browser global
      new PerformanceObserver((list: { getEntries: () => Array<{ startTime: number }> }) => {
        const entries = list.getEntries();
        if (entries.length) v.lcp = entries[entries.length - 1].startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      // @ts-ignore -- browser global
      new PerformanceObserver((list: { getEntries: () => Array<{ value: number; hadRecentInput: boolean }> }) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) v.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // Older/headless Chromium without these entry types: vitals stay at defaults.
    }
  });

  const analyticsMode: AnalyticsMode = options.analyticsMode ?? "block";
  if (analyticsMode !== "allow") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await context.route("**/*", (route: any, request: any) => {
      let blocked = false;
      try {
        // Skip resource types that can't carry an analytics beacon: CSS, fonts,
        // images, media. Keeps the fast path for the vast majority of subresources
        // and preserves Playwright's in-browser networking.
        const resourceType = typeof request.resourceType === "function" ? request.resourceType() : "";
        if (resourceType && !INTERCEPTED_RESOURCE_TYPES.has(resourceType)) {
          // Fall through to continue().
        } else {
          const requestUrl = request.url();
          // Use the top-level navigation URL as the page origin for first-party
          // matching. `request.frame().url()` is `about:blank` before the first
          // navigation commits, which is an opaque origin and would otherwise
          // under-protect same-origin first-party mode.
          const pageOrigin = (() => {
            try {
              const frameUrl = request.frame?.().url?.() ?? "";
              if (frameUrl && frameUrl !== "about:blank") return new URL(frameUrl).origin;
              if (typeof request.isNavigationRequest === "function" && request.isNavigationRequest()) {
                return new URL(requestUrl).origin;
              }
              return undefined;
            } catch {
              return undefined;
            }
          })();
          if (isAnalyticsRequest(requestUrl, {
            mode: analyticsMode,
            pageOrigin,
            extraBlockedHosts: options.extraBlockedHosts,
          })) {
            blocked = true;
          }
        }
      } catch {
        // fall through on any interception-time error: better to let the
        // request proceed than to break rendering over a bad URL parse.
      }

      // Exactly one of abort()/continue() is called; each is wrapped to swallow
      // "Route is already handled" errors that can fire during teardown when a
      // page has been closed mid-flight.
      if (blocked) {
        route.abort().catch(() => { /* route already handled */ });
      } else {
        route.continue().catch(() => { /* route already handled */ });
      }
    });
  }

  let server: { port: number; close: () => void } | null = null;
  if (sourceDir) {
    server = await startStaticServer(sourceDir);
  }

  const results: RenderedPage[] = [];
  let index = 0;

  async function processNext(): Promise<void> {
    while (index < pages.length) {
      const current = index;
      index += 1;
      const entry = pages[current];
      const page = await context.newPage();

      let navigateUrl = entry.url;
      if (entry.localPath && server) {
        const relativePath = entry.localPath.replace(/\\/g, "/");
        navigateUrl = `http://127.0.0.1:${server.port}/${relativePath}`;
      }

      try {
        await page.goto(navigateUrl, {
          waitUntil: "networkidle",
          timeout: options.timeoutMs,
        });
        const html = await page.content();
        // Read the vitals the init-script observers accumulated, plus TTFB from
        // navigation timing. Best-effort: a page that closed the isolate or has
        // no navigation entry yields null fields rather than failing the render.
        const webVitals: WebVitals = await page.evaluate(() => {
          // @ts-ignore -- browser globals
          const v = (window.__pseolint_vitals ?? { lcp: null, cls: null }) as { lcp: number | null; cls: number | null };
          // @ts-ignore -- browser global
          const nav = performance.getEntriesByType("navigation")[0] as { responseStart?: number } | undefined;
          return { lcp: v.lcp, cls: v.cls, ttfb: nav?.responseStart ?? null };
        }).catch(() => ({ lcp: null, cls: null, ttfb: null }));
        results.push({ url: entry.url, html, webVitals });
      } catch {
        // Skip pages that fail to render
      } finally {
        await page.close();
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(options.concurrency, pages.length) },
    () => processNext()
  );

  try {
    await Promise.all(workers);
  } finally {
    // Always tear down server + context + browser, even if a worker threw.
    // Leaking a Chromium process across audit runs is expensive; each of
    // these calls is independently guarded so one failure doesn't skip the
    // others.
    try { server?.close(); } catch { /* noop */ }
    try { await context.close(); } catch { /* noop */ }
    try { await browser.close(); } catch { /* noop */ }
  }

  return results;
}
