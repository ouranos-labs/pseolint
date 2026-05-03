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

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { auditSource } from "../packages/core/src/index.js";
import { CORE_RULESET_VERSION } from "../packages/core/src/ruleset-version.js";
import type { RuleResult, Verdict } from "../packages/core/src/types.js";

// ----- paths --------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = resolve(__dirname, "../packages/core/calibration/reputable-pseo-corpus.json");
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

// ----- single-target audit -----------------------------------------------

async function auditOne(target: CorpusSite, hardTimeoutMs = 90_000): Promise<SiteResult> {
  const result: SiteResult = {
    url: target.url,
    vertical: target.vertical,
    expectedVerdictCeiling: target.expectedVerdictCeiling,
    expectedSiteType: target.expectedSiteType,
    pass: false,
    audit: null,
  };

  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), hardTimeoutMs);
    try {
      const summary = await auditSource(target.url, {
        signal: ctrl.signal,
        safeMode: "saas",
        sampleSize: target.samplingHint?.sampleSize ?? 25,
        samplingStrategy: "stratified",
        // Deterministic sampling so calibration verdicts are reproducible
        // across rounds. Round-to-round verdict drift in rounds 1-6 was
        // partially driven by stratified-sampling picking different pages
        // each run. Fixed seed = same pages each run.
        sampleSeed: 1729,
      });
      const drivers = topDrivers({
        blockers: summary.issues.blockers,
        shouldFix: summary.issues.shouldFix,
        informational: summary.issues.informational,
      });
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

// ----- main --------------------------------------------------------------

async function main(): Promise<void> {
  const corpus = JSON.parse(readFileSync(CORPUS_PATH, "utf-8")) as Corpus;
  const totalSites = corpus.sites.length;

  console.log(`${ansi.bold}Reputable-pSEO calibration${ansi.reset}`);
  console.log(`${ansi.dim}Corpus version ${corpus.version}, ${totalSites} sites, ruleset version ${CORE_RULESET_VERSION}${ansi.reset}\n`);

  const results: SiteResult[] = [];
  let i = 0;
  for (const site of corpus.sites) {
    i += 1;
    process.stdout.write(`${ansi.dim}[${i}/${totalSites}]${ansi.reset} ${site.url} ... `);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
