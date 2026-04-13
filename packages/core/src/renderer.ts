import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

export interface RenderOptions {
  browserWsEndpoint?: string;
  concurrency: number;
  timeoutMs: number;
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
      const page = await browser.newPage();

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
  await browser.close();

  return results;
}
