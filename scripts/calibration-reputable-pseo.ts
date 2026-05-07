/**
 * Reputable-pSEO calibration runner.
 *
 * Audits a curated corpus of programmatic-SEO sites that demonstrably win in
 * production (Zapier, G2, Wise, NerdWallet, …) and asserts that the engine's
 * verdict for each is at or below the per-site `expectedVerdictCeiling`. Any
 * site whose verdict comes back worse than its ceiling is a calibration
 * failure on OUR side, not the site's.
 *
 * This is intentionally separate from `dogfood-v043.ts`. That script
 * validates the engine's classifier against a balanced 5-type sample. This
 * one *challenges* the engine: it asks whether reputable pSEO sites — which
 * Google obviously rewards — actually pass our verdict. If our `concerning`
 * verdict fires on a Zapier-shaped site, our verdict ladder is wrong.
 *
 * Usage:
 *   bun run scripts/calibration-reputable-pseo.ts
 *
 * Outputs:
 *   - scripts/calibration-results.json (consumed by tests/calibration/*)
 *   - scripts/calibration-results.md   (human-readable report)
 *
 * See docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md
 * for methodology, predicted false-positives per rule, and the decision
 * matrix used to convert calibration results into scoring-profile changes.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

import { auditSource, cachedFetch } from "../packages/core/src/index.js";
import type { CachedFetchOptions } from "../packages/core/src/index.js";
import { CORE_RULESET_VERSION } from "../packages/core/src/ruleset-version.js";
import type { RuleResult, Verdict } from "../packages/core/src/types.js";

// ----- CLI flags ----------------------------------------------------------

const args = process.argv.slice(2);
const repinFlagIdx = args.indexOf("--repin");
const isRepinMode = repinFlagIdx !== -1;
// Optional substring filter: `--repin numbeo` repins only sites whose URL
// contains "numbeo". If absent, all sites are repinned.
const repinFilter: string | undefined =
  isRepinMode && args[repinFlagIdx + 1] && !args[repinFlagIdx + 1].startsWith("--")
    ? args[repinFlagIdx + 1]
    : undefined;

// v0.5.15: --snapshot mode captures HTML fixtures for all pinned sites
const snapshotFlagIdx = args.indexOf("--snapshot");
const isSnapshotMode = snapshotFlagIdx !== -1;
const snapshotFilter: string | undefined =
  isSnapshotMode && args[snapshotFlagIdx + 1] && !args[snapshotFlagIdx + 1].startsWith("--")
    ? args[snapshotFlagIdx + 1]
    : undefined;

// v0.6.1: --seed-classifier-urls fetches live sitemaps and writes classifierUrls to corpus
const isSeedClassifierUrlsMode = args.includes("--seed-classifier-urls");

// ----- paths --------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = resolve(__dirname, "../packages/core/calibration/reputable-pseo-corpus.json");
const FIXTURES_BASE = resolve(__dirname, "../packages/core/calibration/fixtures");
const RESULTS_JSON = resolve(__dirname, "calibration-results.json");
const RESULTS_MD = resolve(__dirname, "calibration-results.md");

// ----- corpus types -------------------------------------------------------

const VERDICT_RANK: Record<Verdict, number> = {
  ready: 0,
  caution: 1,
  concerning: 2,
  critical: 3,
};

type Status = "winning" | "stable" | "declining";
type TrafficClass = "very-high" | "high" | "medium" | "low";

interface CorpusSite {
  url: string;
  vertical: string;
  expectedSiteType: string;
  expectedVerdictCeiling: Verdict;
  groundTruth: {
    status: Status;
    trafficClass: TrafficClass;
    evidence: string;
  };
  samplingHint?: {
    sampleSize?: number;
    noRender?: boolean;
  };
  /** v0.5.12 — pinned URLs for stable calibration. Empty = legacy random sampling. */
  pinnedUrls?: string[];
  /** v0.5.15 — relative path to pre-captured fixture directory. When set and directory exists, audit reads from disk. */
  localFixtureDir?: string;
  /** v0.6.1 — full sitemap URL list for classification + template detection. Populated by --seed-classifier-urls. */
  classifierUrls?: string[];
}

interface Corpus {
  version: string;
  rationale: string;
  sites: CorpusSite[];
}

// ----- output types -------------------------------------------------------

interface SiteResult {
  url: string;
  vertical: string;
  expectedVerdictCeiling: Verdict;
  expectedSiteType: string;
  pass: boolean;
  /** When `pass` is false, a one-line reason for human readability. */
  failureReason?: string;
  audit: null | {
    verdict: Verdict;
    risk: number;
    pageCount: number;
    classification: string | undefined;
    classificationConfidence: number | undefined;
    blockers: number;
    shouldFix: number;
    informational: number;
    durationMs: number;
    /** Top-5 driver rules ordered by total severity-weighted impact. */
    topDrivers: Array<{ ruleId: string; count: number; impact: number; severities: string[] }>;
    /** v0.6.1 — template count for v0.6 path verification. */
    templateCount: number;
    /** v0.6.1 — whether v0.6 siteVerdictFromTemplates fired (templateCount >= 2). */
    v6PathExecuted: boolean;
  };
  error?: string;
}

interface CalibrationResults {
  ranAt: string;
  rulesetVersion: string;
  corpusVersion: string;
  /** Per-rule fire-rate aggregates across all sites where the audit succeeded. */
  ruleAggregates: Record<string, { sitesFired: number; sitesAudited: number; firingRatio: number; severityCounts: Record<string, number> }>;
  results: SiteResult[];
  summary: {
    sitesAudited: number;
    sitesPassed: number;
    sitesFailed: number;
    fetchErrors: number;
  };
}

// ----- driver-rule analysis ----------------------------------------------

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 40,
  error: 25,
  warning: 12,
  info: 5,
};

function topDrivers(issues: { blockers: RuleResult[]; shouldFix: RuleResult[]; informational: RuleResult[] }) {
  const byRule = new Map<string, { count: number; impact: number; severities: Set<string> }>();
  const visit = (r: RuleResult) => {
    const w = SEVERITY_WEIGHT[r.severity] ?? 5;
    const cur = byRule.get(r.ruleId) ?? { count: 0, impact: 0, severities: new Set<string>() };
    cur.count += 1;
    cur.impact += w;
    cur.severities.add(r.severity);
    byRule.set(r.ruleId, cur);
  };
  issues.blockers.forEach(visit);
  issues.shouldFix.forEach(visit);
  issues.informational.forEach(visit);
  return [...byRule.entries()]
    .map(([ruleId, v]) => ({ ruleId, count: v.count, impact: v.impact, severities: [...v.severities].sort() }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);
}

// ----- ANSI ---------------------------------------------------------------

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

// ----- fixture helpers ---------------------------------------------------

/**
 * Strip <script> and <style> block contents from HTML to reduce fixture size.
 * The engine's rules only inspect DOM structure, text, meta tags, and JSON-LD
 * embedded in <script type="application/ld+json"> blocks. Regular JS/CSS is not
 * read by any rule and can be dropped without affecting audit results.
 *
 * JSON-LD blocks are preserved because schema/* rules depend on them.
 */
function stripScriptsAndStyles(html: string): string {
  // Remove <style>...</style> blocks entirely
  let out = html.replace(/<style(\s[^>]*)?>[\s\S]*?<\/style>/gi, "");
  // Remove <script> blocks EXCEPT JSON-LD (which schema rules read)
  out = out.replace(/<script(\s[^>]*)?>[\s\S]*?<\/script>/gi, (match, attrs = "") => {
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) {
      return match; // preserve JSON-LD
    }
    return ""; // strip everything else
  });
  return out;
}

/**
 * Derive the fixture directory name for a site URL.
 * e.g. https://wise.com/us/currency-converter → wise_com
 */
function fixtureHostDir(siteUrl: string): string {
  try {
    const host = new URL(siteUrl).host;
    return host.replace(/[^a-zA-Z0-9]/g, "_");
  } catch {
    return siteUrl.replace(/[^a-zA-Z0-9]/g, "_");
  }
}

/**
 * Sanitize a full URL to a safe filename.
 * https://wise.com/us/usd-to-eur → us_usd-to-eur.html
 * Preserves readability; replaces /,?,#,: etc. with _
 */
function urlToFilename(url: string): string {
  try {
    const u = new URL(url);
    // Use path + query, drop host (already in the directory name)
    const raw = (u.pathname + (u.search ? u.search : ""))
      .replace(/^\//, "")  // strip leading slash
      .replace(/[/?#&=:]/g, "_")  // replace separators
      .replace(/_+/g, "_")  // collapse multiple underscores
      .replace(/^_|_$/, "");  // trim edge underscores
    const base = raw || "index";
    return base.endsWith(".html") ? base : `${base}.html`;
  } catch {
    return `page_${Buffer.from(url).toString("hex").slice(0, 16)}.html`;
  }
}

// ----- single-target audit -----------------------------------------------

async function auditOne(target: CorpusSite, hardTimeoutMs = 90_000): Promise<SiteResult & { _auditedUrls?: string[] }> {
  const result: SiteResult & { _auditedUrls?: string[] } = {
    url: target.url,
    vertical: target.vertical,
    expectedVerdictCeiling: target.expectedVerdictCeiling,
    expectedSiteType: target.expectedSiteType,
    pass: false,
    audit: null,
  };

  // v0.5.12: use pinned URLs when available (non-empty) — bypasses random sampling
  const hasPinned = (target.pinnedUrls?.length ?? 0) > 0;

  // v0.5.15: use fixture directory when set and exists — zero network dependency
  const fixtureAbsDir = target.localFixtureDir
    ? resolve(dirname(fileURLToPath(import.meta.url)), "..", target.localFixtureDir)
    : null;
  const useFixtures = fixtureAbsDir !== null && existsSync(fixtureAbsDir);

  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), hardTimeoutMs);
    try {
      // Fixture mode: pass the fixture directory as source. The engine's
      // _manifest.json-aware directory loader restores original URLs.
      // HTTP mode: use pinned URLs or random sampling as before.
      // v0.6.1: pass classifierUrls from corpus when available so the
      // classifier sees the site's true scale even in fixture/pinned mode.
      const classifierUrlsOverride = (target.classifierUrls?.length ?? 0) > 0
        ? target.classifierUrls
        : undefined;
      const summary = useFixtures
        ? await auditSource(fixtureAbsDir!, {
            signal: ctrl.signal,
            safeMode: "saas",
            ...(classifierUrlsOverride ? { classifierUrls: classifierUrlsOverride } : {}),
          })
        : await auditSource(target.url, {
            signal: ctrl.signal,
            safeMode: "saas",
            ...(classifierUrlsOverride ? { classifierUrls: classifierUrlsOverride } : {}),
            ...(hasPinned
              ? { pinnedUrls: target.pinnedUrls }
              : {
                  sampleSize: target.samplingHint?.sampleSize ?? 25,
                  samplingStrategy: "stratified",
                  // Deterministic sampling so calibration verdicts are reproducible
                  // across rounds. Fixed seed = same pages each run.
                  sampleSeed: 1729,
                }),
          });
      result._auditedUrls = summary.auditedUrls;
      const drivers = topDrivers({
        blockers: summary.issues.blockers,
        shouldFix: summary.issues.shouldFix,
        informational: summary.issues.informational,
      });
      const templateCount = summary.templates?.length ?? 0;
      result.audit = {
        verdict: summary.verdict,
        risk: summary.risk ?? 0,
        pageCount: summary.pageCount ?? 0,
        classification: summary.siteClassification?.type,
        classificationConfidence: summary.siteClassification?.confidence,
        blockers: summary.issues.blockers.length,
        shouldFix: summary.issues.shouldFix.length,
        informational: summary.issues.informational.length,
        durationMs: Date.now() - t0,
        topDrivers: drivers,
        templateCount,
        v6PathExecuted: templateCount >= 2,
      };
      const actualRank = VERDICT_RANK[summary.verdict];
      const ceilingRank = VERDICT_RANK[target.expectedVerdictCeiling];
      result.pass = actualRank <= ceilingRank;
      if (!result.pass) {
        result.failureReason =
          `Engine returned verdict='${summary.verdict}' on a site whose ground-truth ` +
          `evidence supports verdict <= '${target.expectedVerdictCeiling}'. The engine is mis-calibrated, not the site.`;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

// ----- aggregator --------------------------------------------------------

function aggregate(results: SiteResult[]): CalibrationResults["ruleAggregates"] {
  const totalAudited = results.filter((r) => r.audit !== null).length;
  const ruleSiteCounts = new Map<string, { sites: Set<string>; severityCounts: Record<string, number> }>();
  for (const r of results) {
    if (!r.audit) continue;
    for (const driver of r.audit.topDrivers) {
      const cur = ruleSiteCounts.get(driver.ruleId) ?? { sites: new Set(), severityCounts: {} };
      cur.sites.add(r.url);
      for (const sev of driver.severities) {
        cur.severityCounts[sev] = (cur.severityCounts[sev] ?? 0) + 1;
      }
      ruleSiteCounts.set(driver.ruleId, cur);
    }
  }
  const out: CalibrationResults["ruleAggregates"] = {};
  for (const [ruleId, v] of ruleSiteCounts.entries()) {
    out[ruleId] = {
      sitesFired: v.sites.size,
      sitesAudited: totalAudited,
      firingRatio: totalAudited > 0 ? v.sites.size / totalAudited : 0,
      severityCounts: v.severityCounts,
    };
  }
  return out;
}

// ----- markdown report ---------------------------------------------------

function renderMarkdown(out: CalibrationResults): string {
  const lines: string[] = [];
  lines.push(`# Reputable-pSEO calibration report`);
  lines.push("");
  lines.push(`- Run at: \`${out.ranAt}\``);
  lines.push(`- Ruleset version: \`${out.rulesetVersion}\``);
  lines.push(`- Corpus version: \`${out.corpusVersion}\``);
  lines.push(`- Sites audited: ${out.summary.sitesAudited}`);
  lines.push(`- Sites passed (verdict ≤ ceiling): ${out.summary.sitesPassed}`);
  lines.push(`- Sites failed: ${out.summary.sitesFailed}`);
  lines.push(`- Fetch errors: ${out.summary.fetchErrors}`);
  lines.push("");
  lines.push(`## Per-site verdicts`);
  lines.push("");
  lines.push(`| Site | Vertical | Expected ≤ | Actual | Δ | Top driver |`);
  lines.push(`| ---- | -------- | ---------- | ------ | -- | ---------- |`);
  for (const r of out.results) {
    const actual = r.audit ? r.audit.verdict : "ERROR";
    const delta = r.audit
      ? VERDICT_RANK[r.audit.verdict] - VERDICT_RANK[r.expectedVerdictCeiling]
      : "—";
    const driver = r.audit?.topDrivers[0]?.ruleId ?? "—";
    const deltaCell = typeof delta === "number" && delta > 0 ? `**+${delta}**` : `${delta}`;
    lines.push(`| ${r.url} | ${r.vertical} | ${r.expectedVerdictCeiling} | ${actual} | ${deltaCell} | \`${driver}\` |`);
  }
  lines.push("");
  lines.push(`## Per-rule fire-rate (across audited sites)`);
  lines.push("");
  lines.push(`| Rule | Sites fired | Firing ratio | Severities |`);
  lines.push(`| ---- | -----------:| ------------:| ---------- |`);
  const sortedRules = Object.entries(out.ruleAggregates).sort((a, b) => b[1].firingRatio - a[1].firingRatio);
  for (const [ruleId, agg] of sortedRules) {
    const sevs = Object.entries(agg.severityCounts).map(([s, n]) => `${s}=${n}`).join(", ");
    lines.push(`| \`${ruleId}\` | ${agg.sitesFired}/${agg.sitesAudited} | ${(agg.firingRatio * 100).toFixed(0)}% | ${sevs} |`);
  }
  lines.push("");
  lines.push(`## Decision matrix`);
  lines.push("");
  lines.push(`Per the spec at \`docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md\`:`);
  lines.push("");
  lines.push(`- Firing ratio > 80% at error+ → suppress for programmatic-directory`);
  lines.push(`- Firing ratio 50-80% at error+ → demote severity by one step + low confidence`);
  lines.push(`- Firing ratio 30-50% at error+ → demote confidence to \`low\``);
  lines.push(`- Firing ratio < 30% → keep as-is`);
  lines.push("");
  return lines.join("\n");
}

// ----- repin mode --------------------------------------------------------

async function mainRepin(): Promise<void> {
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8")) as Corpus;
  const sitesToRepin = repinFilter
    ? corpus.sites.filter((s) => s.url.includes(repinFilter))
    : corpus.sites;

  if (sitesToRepin.length === 0) {
    console.log(`${ansi.yellow}No sites matched filter "${repinFilter}". Nothing to repin.${ansi.reset}`);
    return;
  }

  console.log(`${ansi.bold}Reputable-pSEO calibration — REPIN mode${ansi.reset}`);
  if (repinFilter) {
    console.log(`${ansi.dim}Filter: "${repinFilter}" → ${sitesToRepin.length} site(s)${ansi.reset}\n`);
  } else {
    console.log(`${ansi.dim}Repinning all ${sitesToRepin.length} sites${ansi.reset}\n`);
  }

  let totalPinned = 0;
  let totalSitesRepinned = 0;

  for (const site of sitesToRepin) {
    process.stdout.write(`Repinning ${site.url} ... `);
    // Always use random sampling for repin (ignoring existing pinnedUrls)
    const tempSite: CorpusSite = { ...site, pinnedUrls: [] };
    const r = await auditOne(tempSite);
    if (r.error) {
      console.log(`${ansi.red}ERROR${ansi.reset} ${ansi.dim}${r.error}${ansi.reset} (skipped — no URLs to pin)`);
      continue;
    }
    const fetchedUrls = r._auditedUrls ?? [];
    // Sort + dedupe for deterministic diffs
    const pinned = [...new Set(fetchedUrls)].sort();
    // Write back to corpus
    const corpusSite = corpus.sites.find((s) => s.url === site.url);
    if (corpusSite) {
      corpusSite.pinnedUrls = pinned;
    }
    totalPinned += pinned.length;
    totalSitesRepinned += 1;
    console.log(`${ansi.green}OK${ansi.reset} pinned ${pinned.length} URLs`);
  }

  // Write updated corpus (pretty-printed, 2-space indent)
  writeFileSync(CORPUS_PATH, JSON.stringify(corpus, null, 2) + "\n", "utf-8");

  console.log("");
  console.log(`${ansi.bold}Repin complete${ansi.reset}`);
  console.log(`  Repinned ${totalSitesRepinned} sites with ${totalPinned} URLs total`);
  console.log(`  Run normally now (without --repin) to verify stability.`);
  console.log(`  Wrote ${ansi.cyan}${CORPUS_PATH}${ansi.reset}`);
}

// ----- normal run --------------------------------------------------------

async function mainNormal(): Promise<void> {
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8")) as Corpus;
  const totalSites = corpus.sites.length;

  console.log(`${ansi.bold}Reputable-pSEO calibration${ansi.reset}`);
  console.log(`${ansi.dim}Corpus version ${corpus.version}, ${totalSites} sites, ruleset version ${CORE_RULESET_VERSION}${ansi.reset}\n`);

  const results: SiteResult[] = [];
  let i = 0;
  for (const site of corpus.sites) {
    i += 1;
    const fixtureAbsDir = site.localFixtureDir
      ? resolve(dirname(fileURLToPath(import.meta.url)), "..", site.localFixtureDir)
      : null;
    const usingFixtures = fixtureAbsDir !== null && existsSync(fixtureAbsDir);
    const modeLabel = usingFixtures
      ? ` ${ansi.cyan}[fixture]${ansi.reset}`
      : (site.pinnedUrls?.length ?? 0) > 0
        ? ` ${ansi.dim}[pinned:${site.pinnedUrls!.length}]${ansi.reset}`
        : "";
    process.stdout.write(`${ansi.dim}[${i}/${totalSites}]${ansi.reset}${modeLabel} ${site.url} ... `);
    const r = await auditOne(site);
    if (r.error) {
      console.log(`${ansi.red}ERROR${ansi.reset} ${ansi.dim}${r.error}${ansi.reset}`);
    } else if (r.pass) {
      const v = r.audit?.verdict ?? "?";
      console.log(`${ansi.green}PASS${ansi.reset} verdict=${v} (≤ ${site.expectedVerdictCeiling})`);
    } else {
      const v = r.audit?.verdict ?? "?";
      console.log(`${ansi.red}FAIL${ansi.reset} verdict=${v} > ceiling=${site.expectedVerdictCeiling}`);
    }
    results.push(r);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass && !r.error).length;
  const fetchErrors = results.filter((r) => r.error).length;
  const audited = results.filter((r) => r.audit !== null).length;

  const out: CalibrationResults = {
    ranAt: new Date().toISOString(),
    rulesetVersion: CORE_RULESET_VERSION,
    corpusVersion: corpus.version,
    ruleAggregates: aggregate(results),
    results,
    summary: { sitesAudited: audited, sitesPassed: passed, sitesFailed: failed, fetchErrors },
  };

  writeFileSync(RESULTS_JSON, JSON.stringify(out, null, 2), "utf-8");
  writeFileSync(RESULTS_MD, renderMarkdown(out), "utf-8");

  console.log("");
  console.log(`${ansi.bold}Summary${ansi.reset}`);
  console.log(`  Audited:      ${audited}`);
  console.log(`  ${ansi.green}Passed:${ansi.reset}        ${passed}`);
  console.log(`  ${ansi.red}Failed:${ansi.reset}        ${failed}`);
  console.log(`  ${ansi.yellow}Fetch errors:${ansi.reset}  ${fetchErrors}`);
  console.log("");
  console.log(`Wrote ${ansi.cyan}${RESULTS_JSON}${ansi.reset}`);
  console.log(`Wrote ${ansi.cyan}${RESULTS_MD}${ansi.reset}`);

  if (failed > 0) {
    console.log("");
    console.log(`${ansi.yellow}One or more reputable pSEO sites scored worse than their ceiling.${ansi.reset}`);
    console.log(`${ansi.yellow}Review calibration-results.md → adjust SCORING_PROFILES['programmatic-directory'].${ansi.reset}`);
    process.exitCode = 1;
  }
}

// ----- snapshot mode -----------------------------------------------------

/**
 * Fetch and save HTML fixtures for all sites that have pinnedUrls.
 * Sets localFixtureDir on each snapshotted site and writes back corpus.json.
 */
async function mainSnapshot(): Promise<void> {
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8")) as Corpus;
  const sitesToSnap = (snapshotFilter
    ? corpus.sites.filter((s) => s.url.includes(snapshotFilter))
    : corpus.sites
  ).filter((s) => (s.pinnedUrls?.length ?? 0) > 0);

  if (sitesToSnap.length === 0) {
    console.log(`${ansi.yellow}No sites with pinnedUrls matched${snapshotFilter ? ` filter "${snapshotFilter}"` : ""}. Nothing to snapshot.${ansi.reset}`);
    return;
  }

  console.log(`${ansi.bold}Reputable-pSEO calibration — SNAPSHOT mode${ansi.reset}`);
  if (snapshotFilter) {
    console.log(`${ansi.dim}Filter: "${snapshotFilter}" → ${sitesToSnap.length} site(s)${ansi.reset}\n`);
  } else {
    console.log(`${ansi.dim}Snapshotting ${sitesToSnap.length} sites with pinnedUrls${ansi.reset}\n`);
  }

  let totalSites = 0;
  let totalFiles = 0;
  let totalBytes = 0;

  for (const site of sitesToSnap) {
    const hostDir = fixtureHostDir(site.url);
    const fixtureDir = join(FIXTURES_BASE, hostDir);
    process.stdout.write(`Snapshotting ${site.url} → ${hostDir}/ ... `);

    await mkdir(fixtureDir, { recursive: true });

    const manifest: Record<string, string> = {};
    let siteFiles = 0;
    let siteBytes = 0;
    let siteErrors = 0;

    for (const url of site.pinnedUrls!) {
      const filename = urlToFilename(url);
      // Ensure filenames are unique within the directory (handle collisions)
      let finalFilename = filename;
      let collision = 1;
      while (Object.values(manifest).includes(finalFilename)) {
        const ext = ".html";
        const base = filename.slice(0, -ext.length);
        finalFilename = `${base}_${collision}${ext}`;
        collision++;
      }

      try {
        const fetchOpts: CachedFetchOptions = { timeoutMs: 30_000, cache: null };
        const result = await cachedFetch(url, fetchOpts);
        const rawHtml = result.body ?? "";
        if (!rawHtml) {
          siteErrors++;
          continue;
        }
        // Strip JS/CSS to keep fixture files small; JSON-LD is preserved for schema rules
        const html = stripScriptsAndStyles(rawHtml);
        await writeFile(join(fixtureDir, finalFilename), html, "utf-8");
        manifest[url] = finalFilename;
        siteFiles++;
        siteBytes += Buffer.byteLength(html, "utf-8");
      } catch (err) {
        siteErrors++;
        console.error(`\n  ${ansi.yellow}WARN${ansi.reset} ${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Capture sitemap.xml and robots.txt for the site origin
    try {
      const origin = new URL(site.url).origin;
      for (const path of ["/sitemap.xml", "/robots.txt"]) {
        try {
          const res = await cachedFetch(`${origin}${path}`, { timeoutMs: 15_000, cache: null });
          const text = res.body ?? "";
          if (text) {
            const fname = path.slice(1); // "sitemap.xml" or "robots.txt"
            await writeFile(join(fixtureDir, fname), text, "utf-8");
            siteFiles++;
            siteBytes += Buffer.byteLength(text, "utf-8");
          }
        } catch { /* ignore missing sitemap/robots */ }
      }
    } catch { /* ignore invalid URL */ }

    // Write manifest
    await writeFile(join(fixtureDir, "_manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");

    // Update corpus with relative path (forward slashes for cross-platform)
    const relDir = relative(resolve(__dirname, ".."), fixtureDir).replace(/\\/g, "/") + "/";
    const corpusSite = corpus.sites.find((s) => s.url === site.url);
    if (corpusSite) {
      corpusSite.localFixtureDir = relDir;
    }

    totalSites++;
    totalFiles += siteFiles;
    totalBytes += siteBytes;

    console.log(
      `${ansi.green}OK${ansi.reset} ${siteFiles} HTML files` +
      (siteErrors > 0 ? ` ${ansi.yellow}(${siteErrors} errors)${ansi.reset}` : "")
    );
  }

  // Write updated corpus
  writeFileSync(CORPUS_PATH, JSON.stringify(corpus, null, 2) + "\n", "utf-8");

  const totalKB = Math.round(totalBytes / 1024);
  console.log("");
  console.log(`${ansi.bold}Snapshot complete${ansi.reset}`);
  console.log(`  Snapshotted ${totalSites} sites with ${totalFiles} total files (${totalKB} KB total).`);
  console.log(`  Run normally now (without --snapshot) to verify deterministic mode.`);
  console.log(`  Wrote ${ansi.cyan}${CORPUS_PATH}${ansi.reset}`);
}

// ----- seed-classifier-urls mode -----------------------------------------

/**
 * v0.6.1 — Fetch each corpus site's live sitemap.xml, parse all URLs
 * (recursively resolving sitemap-index entries), cap at 5000 per site,
 * and write them into corpus.json classifierUrls for each site.
 *
 * Invocation: bun run scripts/calibration-reputable-pseo.ts --seed-classifier-urls
 */
async function mainSeedClassifierUrls(): Promise<void> {
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8")) as Corpus;

  console.log(`${ansi.bold}Reputable-pSEO calibration — SEED-CLASSIFIER-URLS mode${ansi.reset}`);
  console.log(`${ansi.dim}Fetching live sitemaps for ${corpus.sites.length} corpus sites${ansi.reset}\n`);

  const MAX_CLASSIFIER_URLS = 5000;

  for (const site of corpus.sites) {
    process.stdout.write(`${site.url} ... `);
    try {
      const origin = new URL(site.url).origin;
      const sitemapUrl = `${origin}/sitemap.xml`;
      const urls = await fetchSitemapUrls(sitemapUrl, MAX_CLASSIFIER_URLS);
      const corpusSite = corpus.sites.find((s) => s.url === site.url);
      if (corpusSite) {
        corpusSite.classifierUrls = urls;
      }
      console.log(`${ansi.green}OK${ansi.reset} ${urls.length} URLs`);
    } catch (err) {
      console.log(`${ansi.yellow}SKIP${ansi.reset} ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  writeFileSync(CORPUS_PATH, JSON.stringify(corpus, null, 2) + "\n", "utf-8");
  console.log("");
  console.log(`${ansi.bold}Seed complete.${ansi.reset} Run normal calibration to apply classifierUrls.`);
  console.log(`Wrote ${ansi.cyan}${CORPUS_PATH}${ansi.reset}`);
}

/**
 * Fetch a sitemap URL and collect all loc entries, recursively expanding
 * sitemap-index entries. Caps at maxUrls total URLs.
 */
async function fetchSitemapUrls(sitemapUrl: string, maxUrls: number): Promise<string[]> {
  const visited = new Set<string>();
  const collected: string[] = [];

  async function fetchOne(url: string): Promise<void> {
    if (visited.has(url) || collected.length >= maxUrls) return;
    visited.add(url);
    const res = await cachedFetch(url, { timeoutMs: 20_000, cache: null });
    const body = res.body ?? "";
    if (!body.trim().startsWith("<")) return;

    const isSitemapIndex = /<sitemapindex/i.test(body);
    if (isSitemapIndex) {
      const childLocs = extractSitemapLocs(body);
      for (const childUrl of childLocs) {
        if (collected.length >= maxUrls) break;
        await fetchOne(childUrl);
      }
    } else {
      const pageLocs = extractSitemapLocs(body);
      for (const loc of pageLocs) {
        if (collected.length >= maxUrls) break;
        if (!visited.has(loc)) {
          collected.push(loc);
        }
      }
    }
  }

  await fetchOne(sitemapUrl);
  return collected.slice(0, maxUrls);
}

/** Extract all loc text values from a sitemap XML string. */
function extractSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const loc = m[1].trim();
    if (loc) locs.push(loc);
  }
  return locs;
}

// ----- main --------------------------------------------------------------

async function main(): Promise<void> {
  if (isSeedClassifierUrlsMode) {
    await mainSeedClassifierUrls();
  } else if (isSnapshotMode) {
    await mainSnapshot();
  } else if (isRepinMode) {
    await mainRepin();
  } else {
    await mainNormal();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
