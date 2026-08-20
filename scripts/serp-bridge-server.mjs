#!/usr/bin/env bun
/**
 * pseolint SERP Bridge Server  (Bun native WebSockets)
 *
 * Listens on ws://localhost:4000 for the pseolint dev-mode extension to
 * connect, then drives SERP landscape + deep-scan queries for a target
 * keyword list and writes results to a JSON output file.
 *
 * Usage:
 *   bun scripts/serp-bridge-server.mjs [--out results.json]
 *
 * Workflow:
 *   1. Build the extension with `bun run build:dev` (sets PSEOLINT_MCP_BRIDGE=true)
 *   2. Load it unpacked in Chrome (chrome://extensions → Load unpacked → apps/extension/dist)
 *   3. Run this server:  bun scripts/serp-bridge-server.mjs
 *   4. For each SERP query the script prompts you for, open Google Search
 *      in the ACTIVE Chrome tab; the script captures landscape + deep-scan data.
 *
 * Press Ctrl-C at any time: partial results are saved automatically.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 4000;

// ── Output path ───────────────────────────────────────────────────────────────
const outArg = process.argv.indexOf("--out");
const outFile =
  outArg !== -1
    ? process.argv[outArg + 1]
    : join(__dirname, "..", "serp-analysis-results.json");

// ── State ─────────────────────────────────────────────────────────────────────
/** @type {import("bun").ServerWebSocket | null} */
let extWs = null;
let msgIdCounter = 0;
/** @type {Record<string, { resolve: Function; reject: Function; timer: ReturnType<typeof setTimeout> }>} */
const pending = {};
/** Messages queued while the extension is suspended; flushed on reconnect. */
const msgQueue = [];
const results = [];

// ── Readline (for prompts) ────────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });
const question = (msg) => new Promise((res) => rl.question(msg, res));

// ── Bun WebSocket server ──────────────────────────────────────────────────────
const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    // Upgrade every incoming request to WebSocket
    if (server.upgrade(req)) return; // handled
    return new Response("pseolint bridge: WebSocket only", { status: 426 });
  },
  websocket: {
    open(ws) {
      console.log("✓ Extension connected");
      extWs = ws;
      // Flush messages queued while the service worker was suspended.
      for (const msg of msgQueue.splice(0)) {
        try { ws.send(msg); } catch {}
      }
    },
    message(ws, data) {
      try {
        const msg = JSON.parse(typeof data === "string" ? data : data.toString());
        const resolver = pending[msg.id];
        if (resolver) {
          clearTimeout(resolver.timer);
          delete pending[msg.id];
          resolver.resolve(msg.payload);
        }
      } catch (err) {
        console.error("Bad message from extension:", err);
      }
    },
    close(ws) {
      console.log("⚡ Extension disconnected; waiting for reconnect...");
      extWs = null;
      for (const [id, { reject, timer }] of Object.entries(pending)) {
        clearTimeout(timer);
        reject(new Error("Extension disconnected"));
        delete pending[id];
      }
    },
    error(ws, err) {
      console.error("WebSocket error:", err.message);
    },
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Enqueue a typed request to the extension and resolve when it replies.
 * The message is sent immediately if connected, or queued until the next
 * chrome.alarms-triggered reconnect: no polling, no race conditions.
 */
function sendToExtension(type, payloadData = {}, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const id = String(++msgIdCounter);
    const timer = setTimeout(() => {
      delete pending[id];
      // Also remove from queue if it was never sent
      const qi = msgQueue.findIndex((m) => m.includes(`"id":"${id}"`) || m.includes(`"id": "${id}"`) );
      if (qi !== -1) msgQueue.splice(qi, 1);
      reject(new Error(`Timeout: extension did not respond to ${type} within ${timeoutMs / 1000}s`));
    }, timeoutMs);
    pending[id] = { resolve, reject, timer };

    const payload = JSON.stringify({ id, type, payload: payloadData });
    if (extWs) {
      try { extWs.send(payload); }
      catch { msgQueue.push(payload); } // closed between check and send; queue it
    } else {
      msgQueue.push(payload); // sent when extension next reconnects via alarm
    }
  });
}

function waitForExtension() {
  return new Promise((resolve) => {
    if (extWs) return resolve();
    const check = setInterval(() => {
      if (extWs) { clearInterval(check); resolve(); }
    }, 500);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeResultsFile() {
  try {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(
      outFile,
      JSON.stringify({ generatedAt: new Date().toISOString(), queries: results }, null, 2)
    );
  } catch (err) {
    console.error("Failed to write results:", err.message);
  }
}

// ── SERP Queries for podcurator.io ────────────────────────────────────────────
const QUERIES = [
  // Pillar / Category Directories
  { q: "best business podcasts", label: "best/business" },
  { q: "best tech podcasts", label: "best/technology" },
  { q: "best history podcasts", label: "best/history" },
  { q: "best true crime podcasts", label: "best/true-crime" },
  { q: "best science podcasts", label: "best/science" },
  { q: "best health podcasts", label: "best/health" },
  // Competitors / Alternatives
  { q: "spotify podcast discovery alternative", label: "compare/spotify" },
  { q: "listen notes alternative", label: "compare/listen-notes" },
  { q: "podchaser similar sites", label: "compare/podchaser" },
  // Long-Tail / Similar Show Searches (pSEO)
  { q: "podcasts like huberman lab", label: "longtail/huberman-lab-similar" },
  { q: "podcasts like serial", label: "longtail/serial-similar" },
  // General Editorial / Intent
  { q: "how to find new podcasts", label: "blog/how-to-find" },
  { q: "best podcast playlist to commute", label: "blog/commute-playlist" },
  { q: "podcast recommendation engine", label: "core/recommendation-engine" },
];

// ── Opportunity Scoring & Summary ─────────────────────────────────────────────
function printOpportunitySummary() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║           SERP Opportunity Summary - podcurator.io    ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const opps = [];
  for (const item of results) {
    const summary = item.landscape?.summary;
    const scanResults = item.deepScan?.results ?? [];
    const total = summary?.total ?? 0;
    const templated = summary?.templated ?? 0;
    const pSEORatio = total > 0 ? templated / total : 0;
    const weak = scanResults.filter(
      (r) => r.ok && r.verdict && ["concerning", "critical"].includes(r.verdict?.level ?? r.verdict)
    ).length;
    const noSchema = scanResults.filter((r) => r.ok && r.flags?.includes("no schema")).length;
    const noMetaDesc = scanResults.filter((r) => r.ok && r.flags?.includes("no meta desc")).length;
    const thin = scanResults.filter((r) => r.ok && r.isLikelyShell).length;
    const score = Math.round(
      pSEORatio * 40 + (weak / Math.max(total, 1)) * 40 + (thin / Math.max(total, 1)) * 20
    );
    opps.push({ label: item.label, query: item.query, total, templated, pSEORatio: Math.round(pSEORatio * 100), weak, noSchema, noMetaDesc, thin, score });
  }

  opps.sort((a, b) => b.score - a.score);

  console.log("Queries ranked by opportunity (higher score = weaker/more-pSEO competition):\n");
  for (const op of opps) {
    const bar = "█".repeat(Math.min(Math.round(op.score / 5), 20));
    console.log(`  [${String(op.score).padStart(3)}] ${bar}`);
    console.log(`        ${op.label}  ·  "${op.query}"`);
    console.log(`        ${op.total} results · ${op.pSEORatio}% templated · ${op.weak} weak · ${op.noSchema} no-schema · ${op.thin} thin`);
    console.log();
  }

  const topNoSchema = [...opps].sort((a, b) => b.noSchema - a.noSchema).slice(0, 5);
  console.log("Top queries where competitors lack JSON-LD schema (easy E-E-A-T win):");
  for (const op of topNoSchema) {
    console.log(`  • "${op.query}"  →  ${op.noSchema}/${op.total} missing schema`);
  }

  const highPseo = opps.filter((o) => o.pSEORatio >= 40 && o.score >= 20);
  if (highPseo.length) {
    console.log("\nHigh pSEO ratio queries (≥40% templated; quality content can outrank):");
    for (const op of highPseo) {
      console.log(`  • "${op.query}"  →  ${op.pSEORatio}% templated results`);
    }
  }

  console.log("\nFull JSON data:", outFile, "\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  pseolint SERP Bridge  -  podcurator.io opportunity scan");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\n  Bridge listening on ws://localhost:${PORT}`);
  console.log("  Make sure you have:\n");
  console.log("  1. Built the extension:  cd apps/extension && bun run build:dev");
  console.log("  2. Loaded it unpacked in Chrome (chrome://extensions)");
  console.log("  3. The extension icon should show in Chrome's toolbar\n");

  // ── Resume: load any already-saved results ──────────────────────────────────
  const fromArg = process.argv.indexOf("--from");
  const fromIndex = fromArg !== -1 ? parseInt(process.argv[fromArg + 1], 10) : 0;
  try {
    const existing = JSON.parse(require("node:fs").readFileSync(outFile, "utf8"));
    if (Array.isArray(existing.queries)) {
      for (const r of existing.queries) results.push(r);
      console.log(`  Resuming: loaded ${results.length} existing result(s) from ${outFile}`);
    }
  } catch { /* no existing file; start fresh */ }

  // Build a set of already-captured labels so we can skip them
  const done = new Set(results.map((r) => r.label));
  const remaining = QUERIES.filter((q, i) => i >= fromIndex && !done.has(q.label));

  if (remaining.length === 0) {
    console.log("  All queries already captured! Running summary only.");
    printOpportunitySummary();
    process.exit(0);
  }

  console.log(`  ${remaining.length} quer${remaining.length === 1 ? "y" : "ies"} to capture.\n`);
  console.log("Waiting for the dev extension to connect...\n");

  await waitForExtension();

  for (let i = 0; i < remaining.length; i++) {
    const { q, label } = remaining[i];
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&num=20`;
    const idx = QUERIES.findIndex((x) => x.label === label) + 1;

    console.log(`\n──────────────────────────────────────────────`);
    console.log(`[${idx}/${QUERIES.length}]  ${label}`);
    console.log(`Query: "${q}"`);
    console.log(`URL:   ${googleUrl}`);

    // Navigate the active tab automatically using Chrome extension APIs
    try {
      process.stdout.write("  ⟳ Navigating active tab... ");
      await sendToExtension("pseolint:mcp-navigate", { url: googleUrl }, 10_000);
      console.log("✓");
    } catch (err) {
      console.log(`✗ (${err.message})`);
      await question("→ Open the Google URL above in Chrome's active tab, then press Enter: ");
    }

    // Wait for page navigation and content script loading to complete
    await sleep(3500);

    let landscape = null;
    let deepScan = null;

    // Tier 1: landscape (fast, no fetch) with retries if the content script is not ready
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          process.stdout.write(`  ⟳ Retrying landscape (${attempt}/${maxRetries})... `);
        } else {
          process.stdout.write("  ⟳ Landscape... ");
        }
        landscape = await sendToExtension("pseolint:mcp-get-landscape", {}, 15_000);
        if (landscape?.error) {
          console.log(`✗ ${landscape.error}`);
          landscape = null;
        } else {
          const s = landscape?.summary;
          console.log(`✓  ${s?.total ?? 0} results · ${s?.templated ?? 0} templated · ${s?.clusters?.length ?? 0} clusters`);
          break; // Succeeded!
        }
      } catch (err) {
        console.log(`✗ ${err.message}`);
        if (attempt < maxRetries) {
          await sleep(2500); // Wait for tab to load before retrying
        }
      }
    }

    // Deep scan disabled to speed up execution.
    deepScan = null;

    results.push({
      query: q,
      label,
      googleUrl,
      timestamp: new Date().toISOString(),
      landscape: landscape ?? null,
      deepScan: deepScan ?? null,
    });

    writeResultsFile();
    console.log(`  Saved → ${outFile}`);
  }

  rl.close();
  console.log("\n\n✓ All queries complete!");
  printOpportunitySummary();
  process.exit(0);
}

process.on("SIGINT", () => {
  console.log("\n\n⚡ Interrupted; saving partial results...");
  writeResultsFile();
  if (results.length > 0) printOpportunitySummary();
  rl.close();
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
