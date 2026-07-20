/**
 * Page-filter false-positive rate over the calibration fixtures.
 *
 * The five page-skip detectors (page-filter.ts) remove pages from the audit
 * before rules run. A false positive here = a legitimate content page the
 * engine drops. The fixtures are the pages the engine is *meant* to audit, so
 * every skip on them is a candidate FP — the exceptions are fixtures that are
 * genuinely non-content (a real `/privacy` page, a `?q=` search URL). The
 * script prints every skip with its reason so those genuine skips can be told
 * apart from real FPs by eye.
 *
 * Real URLs come from each fixture dir's `_manifest.json` ({ url: filename }),
 * so URL-based signals (boilerplate-url, search-result) see the true path.
 * Fixtures with no manifest entry fall back to a host/filename guess and are
 * flagged `url:guessed` in the output.
 *
 * Run: bun run calibration/fp-rate.ts   (from packages/core)
 * Reports three configs: CLI default (noindex only), web default
 * (noindex+auth+boilerplate+search), and all-on (upper bound). The per-page
 * skip list is printed for the all-on config so every possible skip is visible.
 *
 * ponytail: skip = candidate FP, human eyeballs the printed list. No attempt
 * to auto-label ground truth we don't have — that would be fake precision.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHtmlPage } from "../src/parser.js";
import { pageSkipReason } from "../src/page-filter.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const OFF = {
  respectNoindex: false,
  skipDetectedAuth: false,
  skipBoilerplate: false,
  skipSearchPages: false,
  skipEmptyBody: false,
};
// Defaults mirror auditor.ts. Since v0.7.x the engine/CLI/web all default to
// noindex+auth+boilerplate+search; skipEmptyBody stays opt-in.
const CONFIGS = {
  "noindex-only (--no-skip-* everything)": { ...OFF, respectNoindex: true },
  "default (engine/cli/web: noindex+auth+boilerplate+search)": {
    ...OFF, respectNoindex: true, skipDetectedAuth: true, skipBoilerplate: true, skipSearchPages: true,
  },
  "all-on (default + --skip-empty-body)": {
    respectNoindex: true, skipDetectedAuth: true, skipBoilerplate: true, skipSearchPages: true, skipEmptyBody: true,
  },
} as const;
// The all-on config drives the per-page skip listing (widest net).
const SKIP_OPTS = CONFIGS["all-on (default + --skip-empty-body)"];

/** filename -> real URL, from the dir's _manifest.json (inverted). */
function loadManifest(dir: string): Map<string, string> {
  const path = join(dir, "_manifest.json");
  const byFile = new Map<string, string>();
  if (!existsSync(path)) return byFile;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  for (const [url, file] of Object.entries(raw)) byFile.set(file, url);
  return byFile;
}

interface Skip { url: string; file: string; reason: string; guessed: boolean; }

// Parse every fixture once; evaluate each config against the cached pages.
const pages: Array<{ page: ReturnType<typeof parseHtmlPage>; file: string; url: string; guessed: boolean }> = [];

for (const host of readdirSync(FIXTURES_DIR)) {
  const dir = join(FIXTURES_DIR, host);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".html"));
  } catch {
    continue; // not a directory
  }
  const manifest = loadManifest(dir);
  for (const file of files) {
    const html = readFileSync(join(dir, file), "utf8");
    const mapped = manifest.get(file);
    const guessed = mapped === undefined;
    // Fallback URL guess: host as domain, filename underscores -> path segments.
    const url = mapped ?? `https://${host.replace(/_/g, ".")}/${basename(file, ".html").replace(/_/g, "/")}`;
    pages.push({ page: parseHtmlPage(html, url), file: `${host}/${file}`, url, guessed });
  }
}

const total = pages.length;

console.log(`\nPage-filter FP-rate over ${total} calibration fixtures\n`);
console.log(`  Each row: pages skipped (= removed from the audit) under that config.\n`);
for (const [name, opts] of Object.entries(CONFIGS)) {
  const byReason: Record<string, number> = {};
  let n = 0;
  for (const { page } of pages) {
    const reason = pageSkipReason(page, opts);
    if (reason) { n++; byReason[reason] = (byReason[reason] ?? 0) + 1; }
  }
  const rate = total === 0 ? 0 : (n / total) * 100;
  const breakdown = Object.entries(byReason).map(([r, c]) => `${r}=${c}`).join(", ") || "none";
  console.log(`  ${name.padEnd(46)} ${String(n).padStart(2)} skipped (${rate.toFixed(1)}%)  [${breakdown}]`);
}

// Per-page listing under the widest (all-on) net.
const skips: Skip[] = [];
for (const { page, file, url, guessed } of pages) {
  const reason = pageSkipReason(page, SKIP_OPTS);
  if (reason) skips.push({ url, file, reason, guessed });
}

if (skips.length > 0) {
  console.log(`\n  Every possible skip (all-on config). Legit if the page really is`);
  console.log(`  auth/boilerplate/search/shell; a false positive if it's real content.`);
  console.log(`  '(url guessed)' = no manifest entry, URL signals may be unreliable.\n`);
  for (const s of skips.sort((a, b) => a.reason.localeCompare(b.reason))) {
    console.log(`    [${s.reason}] ${s.file}${s.guessed ? "  (url guessed)" : ""}`);
    console.log(`        ${s.url}`);
  }
}
console.log();
