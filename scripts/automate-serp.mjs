#!/usr/bin/env bun
/**
 * Fully Automated pseolint SERP Scanner
 * Uses Playwright to drive Chrome, load the extension, and scan queries automatically.
 *
 * Usage:
 *   bun scripts/automate-serp.mjs
 */

import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 4000;
const outFile = join(__dirname, "..", "serp-analysis-results.json");
const extensionPath = join(__dirname, "..", "apps", "extension");

// ── State ─────────────────────────────────────────────────────────────────────
let extWs = null;
let msgIdCounter = 0;
const pending = {};
const msgQueue = [];
const results = [];

// ── Query List ────────────────────────────────────────────────────────────────
const QUERIES = [
  { q: "podcast directory website", label: "core/podcast-directory" },
  { q: "podcast discovery app", label: "core/podcast-discovery-app" },
  { q: "best podcast app 2025", label: "core/best-podcast-app" },
  { q: "curated podcast recommendations", label: "editorial/curated-recs" },
  { q: "podcast curation platform", label: "editorial/curation-platform" },
  { q: "find new podcasts to listen to", label: "editorial/find-new-podcasts" },
  { q: "true crime podcast recommendations", label: "niche/true-crime" },
  { q: "business podcast directory", label: "niche/business" },
  { q: "comedy podcast recommendations 2025", label: "niche/comedy" },
  { q: "technology podcast directory", label: "niche/technology" },
  { q: "listen notes podcast search", label: "competitor/listen-notes" },
  { q: "podchaser podcast database", label: "competitor/podchaser" },
  { q: "what podcasts should I listen to", label: "longtail/what-to-listen" },
  { q: "podcast recommendation engine", label: "longtail/recommendation-engine" },
];

// ── Helper: WS Messaging ──────────────────────────────────────────────────────
function sendToExtension(type, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const id = String(++msgIdCounter);
    const timer = setTimeout(() => {
      delete pending[id];
      const qi = msgQueue.findIndex((m) => m.includes(`"id":"${id}"`));
      if (qi !== -1) msgQueue.splice(qi, 1);
      reject(new Error(`Timeout waiting for ${type}`));
    }, timeoutMs);
    pending[id] = { resolve, reject, timer };

    const payload = JSON.stringify({ id, type, payload: {} });
    if (extWs) {
      try { extWs.send(payload); }
      catch { msgQueue.push(payload); }
    } else {
      msgQueue.push(payload);
    }
  });
}

function waitForConnection(timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    if (extWs) return resolve();
    const deadline = setTimeout(() => {
      clearInterval(poll);
      reject(new Error("Extension did not connect to WebSocket"));
    }, timeoutMs);
    const poll = setInterval(() => {
      if (extWs) {
        clearInterval(poll);
        clearTimeout(deadline);
        resolve();
      }
    }, 200);
  });
}

// ── Opportunity Scoring ───────────────────────────────────────────────────────
function printOpportunitySummary() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║           SERP Opportunity Summary — podcurator.io    ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const opps = [];
  for (const item of results) {
    const summary = item.landscape?.summary;
    const total = summary?.total ?? 0;
    const templated = summary?.templated ?? 0;
    const pSEORatio = total > 0 ? templated / total : 0;
    const score = Math.round(pSEORatio * 100);
    opps.push({ label: item.label, query: item.query, total, templated, pSEORatio: Math.round(pSEORatio * 100), score });
  }

  opps.sort((a, b) => b.score - a.score);

  console.log("Queries ranked by opportunity (higher = templated/pSEO competition):\n");
  for (const op of opps) {
    const bar = "█".repeat(Math.min(Math.round(op.score / 5), 20));
    console.log(`  [${String(op.score).padStart(3)}] ${bar}`);
    console.log(`        ${op.label}  ·  "${op.query}"`);
    console.log(`        ${op.total} results · ${op.pSEORatio}% templated`);
    console.log();
  }
}

// ── Main Execution ────────────────────────────────────────────────────────────
async function main() {
  console.log("⚡ Building extension in dev mode...");
  execSync("bun run build:dev", { cwd: extensionPath, stdio: "inherit" });

  console.log("\n⚡ Starting WebSocket Bridge Server on port 4000...");
  const wsServer = Bun.serve({
    port: PORT,
    fetch(req, server) {
      if (server.upgrade(req)) return;
      return new Response("Bridge", { status: 400 });
    },
    websocket: {
      open(ws) {
        console.log("  ✓ Extension WebSocket connected");
        extWs = ws;
        for (const msg of msgQueue.splice(0)) {
          try { ws.send(msg); } catch {}
        }
      },
      message(ws, data) {
        try {
          const msg = JSON.parse(data.toString());
          const resolver = pending[msg.id];
          if (resolver) {
            clearTimeout(resolver.timer);
            delete pending[msg.id];
            resolver.resolve(msg.payload);
          }
        } catch {}
      },
      close() {
        extWs = null;
      }
    }
  });

  console.log("⚡ Launching automated browser...");
  
  // Playwright Chromium is used natively
  const executablePath = undefined;

  const userDataDir = join(__dirname, "..", ".chrome-user-data");
  
  // Delete user data directory to avoid locks and state contamination on Windows
  try {
    const { rmSync } = await import("node:fs");
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {}

  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false, // Chrome extensions only work in non-headless mode
    timeout: 30000,  // Fail fast in 30s if there's a connection issue
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox"
    ]
  });

  const page = await browserContext.newPage();

  console.log("\n⚡ Starting automatic scan...");
  for (let i = 0; i < QUERIES.length; i++) {
    const { q, label } = QUERIES[i];
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&num=20`;

    console.log(`\n[${i + 1}/${QUERIES.length}] Scanning "${q}"...`);

    // Navigate to Google search
    await page.goto(googleUrl);
    
    // Give content script a moment to load and wake service worker
    await page.waitForTimeout(3000);

    let landscape = null;
    try {
      await waitForConnection(10000);
      landscape = await sendToExtension("pseolint:mcp-get-landscape", 10000);
      if (landscape?.error) {
        console.log(`  ✗ ${landscape.error}`);
        landscape = null;
      } else {
        const s = landscape?.summary;
        console.log(`  ✓ ${s?.total ?? 0} results · ${s?.templated ?? 0} templated`);
      }
    } catch (err) {
      console.log(`  ✗ Scanning failed: ${err.message}`);
    }

    results.push({
      query: q,
      label,
      googleUrl,
      timestamp: new Date().toISOString(),
      landscape: landscape ?? null,
      deepScan: null
    });
  }

  console.log("\n⚡ Writing results to file...");
  writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), queries: results }, null, 2));

  console.log("⚡ Closing browser...");
  await browserContext.close();
  wsServer.stop();

  printOpportunitySummary();
  console.log("Scan complete!");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
