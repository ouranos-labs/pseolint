import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { isAnalyticsRequest, type AnalyticsMode } from "./analytics-blocklist.js";

/**
 * Distinct User-Agent for rendered audits. Includes the standard `+URL` bot
 * marker so server-side analytics filters (GA4, Matomo, Cloudflare) can drop
 * it automatically, and keeps the `compatible` token so sites that sniff real
 * browsers for feature gating still serve content.
 */
const RENDER_USER_AGENT =
  "Mozilla/5.0 (compatible; pseolint-render/0.3.1; +https://pseolint.dev/bot)";

export interface RenderOptions {
  browserWsEndpoint?: string;
  concurrency: number;
  timeoutMs: number;
  /**
   * How to handle analytics / telemetry / session-replay beacons.
   *   "block" (default) — abort known analytics hosts (Google Analytics, Plausible,
   *     Mixpanel, Hotjar, PostHog, Sentry, etc.). Prevents the audit from injecting
   *     fake pageviews / sessions into the site owner's dashboards.
   *   "allow-first-party" — block third-party analytics only; keep same-origin
   *     requests for sites that self-host analytics on their own domain.
   *   "allow" — don't intercept anything. Use this only when you're auditing a
   *     site you own and explicitly want render-mode traffic in your analytics.
   */
  analyticsMode?: AnalyticsMode;
  /** Extra host tokens to block in addition to the default list (substring match). */
  extraBlockedHosts?: readonly string[];
}

interface RenderedPage {
  url: string;
  html: string;
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
    browser = await pw.chromium.launch({ headless: true });
  }

  // One browser context carries the UA + privacy headers + init script for every
  // audited page. `DNT` / `Sec-GPC` signal privacy-respecting analytics stacks
  // to skip collection; `window.__pseolint_audit` lets cooperating sites
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
    (window as unknown as Record<string, unknown>).__pseolint_audit = true;
  });

  const analyticsMode: AnalyticsMode = options.analyticsMode ?? "block";
  if (analyticsMode !== "allow") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await context.route("**/*", (route: any, request: any) => {
      try {
        const requestUrl = request.url();
        const pageOrigin = (() => {
          try {
            return new URL(request.frame().url()).origin;
          } catch {
            return undefined;
          }
        })();
        if (isAnalyticsRequest(requestUrl, {
          mode: analyticsMode,
          pageOrigin,
          extraBlockedHosts: options.extraBlockedHosts,
        })) {
          route.abort();
          return;
        }
      } catch {
        // fall through on any interception-time error — better to let the
        // request proceed than to break rendering over a bad URL parse.
      }
      route.continue();
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
        results.push({ url: entry.url, html });
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
  await Promise.all(workers);

  server?.close();
  await context.close();
  await browser.close();

  return results;
}
