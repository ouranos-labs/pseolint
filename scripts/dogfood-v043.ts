/**
 * v0.4.3 dogfood — validate the new classification-driven scoring
 * (SCORING_PROFILES + RULE_IMPACTS + per-rule confidence) against a
 * broader site distribution covering all 5 classifier types.
 *
 * Two-phase workflow:
 *   1. Phase 1 (BEFORE Agent A + B land): capture baseline with the
 *      current v0.4.2 engine. Snapshot saved to dogfood-baseline.json.
 *      Run: `bun run scripts/dogfood-v043.ts --baseline`
 *
 *   2. Phase 2 (AFTER Agent A + B finish): re-run with same targets,
 *      compare side-by-side, surface regressions. Snapshot saved to
 *      dogfood-v043-results.json.
 *      Run: `bun run scripts/dogfood-v043.ts`
 *
 * Each site is audited ONCE, sequentially, with a 5-page sample, saas
 * safe mode, and a 60s hard timeout. The `humanGrade` field on each
 * target is the curator's expected verdict; mismatches get flagged.
 *
 * Validation passes when:
 *   - all `humanGrade: ready` sites actually score `ready` post-change
 *   - all `humanGrade: concerning|critical` sites STILL score that way
 *     (we did not break true-positive spam detection).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { detectFrameworkFromUrl } from "../apps/web/src/lib/audit-defaults.js";
import { auditSource } from "../packages/core/src/index.js";
import type { RuleResult, Verdict } from "../packages/core/src/types.js";

// ----- paths --------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(__dirname, "dogfood-baseline.json");
const RESULTS_PATH = resolve(__dirname, "dogfood-v043-results.json");

// ----- targets ------------------------------------------------------------

interface Target {
  url: string;
  expectedType: string;
  expectedFramework?: string;
  humanGrade: Verdict;
}

const TARGETS: Target[] = [
  // ───── docs sites — historically over-penalised by AEO rules ─────
  { url: "https://nextjs.org", expectedType: "docs", expectedFramework: "nextjs", humanGrade: "ready" },
  { url: "https://react.dev", expectedType: "docs", expectedFramework: "nextjs", humanGrade: "ready" },
  { url: "https://docs.python.org/3/", expectedType: "docs", humanGrade: "ready" },

  // ───── small-marketing — pSEO-only rules should be suppressed ─────
  { url: "https://stripe.com", expectedType: "small-marketing", humanGrade: "ready" },
  { url: "https://linear.app", expectedType: "small-marketing", humanGrade: "ready" },
  { url: "https://supabase.com", expectedType: "small-marketing", humanGrade: "ready" },
  { url: "https://posthog.com", expectedType: "small-marketing", humanGrade: "ready" },
  // shopify corporate marketing site (not a store)
  { url: "https://www.shopify.com", expectedType: "small-marketing", humanGrade: "ready" },

  // ───── ecommerce — Shopify-shape stores ─────
  { url: "https://www.allbirds.com", expectedType: "ecommerce", expectedFramework: "shopify", humanGrade: "ready" },
  { url: "https://www.gymshark.com", expectedType: "ecommerce", expectedFramework: "shopify", humanGrade: "ready" },

  // ───── blog / multi-author CMS ─────
  { url: "https://wordpress.com", expectedType: "blog", expectedFramework: "wordpress", humanGrade: "caution" },
  { url: "https://blog.cloudflare.com", expectedType: "blog", humanGrade: "ready" },

  // ───── programmatic directories — we WANT these to score concerning+ ─────
  { url: "https://www.softschools.com", expectedType: "programmatic-directory", humanGrade: "concerning" },
  // city × cost-of-living pSEO directory
  { url: "https://www.expatistan.com", expectedType: "programmatic-directory", humanGrade: "caution" },
];

// ----- types --------------------------------------------------------------

interface AuditSnapshot {
  url: string;
  expectedType: string;
  expectedFramework?: string;
  humanGrade: Verdict;
  detectedFramework: string | undefined;
  audit: null | {
    verdict: Verdict;
    risk: number;
    pageCount: number;
    blockers: number;
    shouldFix: number;
    informational: number;
    classification: string | undefined;
    classificationConfidence: number | undefined;
    suppressedRules: number;
    skippedUrls: number;
    durationMs: number;
    /** Top-3 driver rules ordered by total impact (count × severity weight). */
    topDrivers: Array<{ ruleId: string; count: number; impact: number; severities: string[] }>;
  };
  error?: string;
}

interface Snapshot {
  capturedAt: string;
  phase: "baseline" | "v0.4.3";
  results: AuditSnapshot[];
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

// ----- driver-rule analysis ----------------------------------------------

/** Rough severity weight, mirroring the v0.4.x scorer for ordering. */
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
    .map(([ruleId, v]) => ({
      ruleId,
      count: v.count,
      impact: v.impact,
      severities: [...v.severities].sort(),
    }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3);
}

// ----- single-target audit -----------------------------------------------

async function auditOne(target: Target, hardTimeoutMs = 60_000): Promise<AuditSnapshot> {
  const snap: AuditSnapshot = {
    url: target.url,
    expectedType: target.expectedType,
    expectedFramework: target.expectedFramework,
    humanGrade: target.humanGrade,
    detectedFramework: undefined,
    audit: null,
  };

  // framework detection — quick 5s probe
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    try {
      snap.detectedFramework = await detectFrameworkFromUrl(target.url, ctrl.signal);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    snap.error = `framework-detect failed: ${err instanceof Error ? err.message : String(err)}`;
    // Don't bail — still attempt the audit.
  }

  // The audit itself, with a hard wall-clock timeout.
  const start = Date.now();
  try {
    const summary = await Promise.race([
      auditSource(target.url, {
        sampleSize: 3,
        concurrency: 1,
        safeMode: "saas",
        // Disable backpressure during dogfood: third-party origins commonly
        // jitter past 2× baseline p95 mid-audit (CDN edges, geo-routing) and
        // we'd rather get slow data than no data. Production audits keep the
        // watchdog ON.
        backpressure: false,
        respectNoindex: true,
        skipDetectedAuth: true,
        skipBoilerplate: true,
        skipSearchPages: true,
        skipEmptyBody: true,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`hard-timeout-${hardTimeoutMs}ms`)), hardTimeoutMs),
      ),
    ]);

    snap.audit = {
      verdict: summary.verdict,
      risk: summary.risk,
      pageCount: summary.pageCount,
      blockers: summary.issues.blockers.length,
      shouldFix: summary.issues.shouldFix.length,
      informational: summary.issues.informational.length,
      classification: summary.siteClassification?.type,
      classificationConfidence: summary.siteClassification?.confidence,
      suppressedRules: summary.siteClassification?.suppressedRules.length ?? 0,
      skippedUrls: summary.skippedUrls?.length ?? 0,
      durationMs: Date.now() - start,
      topDrivers: topDrivers(summary.issues),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    snap.error = (snap.error ? snap.error + " | " : "") + `audit failed: ${msg}`;
  }

  return snap;
}

// ----- pretty print ------------------------------------------------------

function printSnapshot(snap: AuditSnapshot): void {
  console.log(`\n${ansi.bold}▸ ${snap.url}${ansi.reset}`);
  console.log(`  expected: type=${snap.expectedType}, framework=${snap.expectedFramework ?? "(any)"}, humanGrade=${snap.humanGrade}`);
  if (snap.error) {
    console.log(`  ${ansi.red}✗ ${snap.error}${ansi.reset}`);
  }
  if (!snap.audit) return;
  const a = snap.audit;
  const mismatch = a.verdict !== snap.humanGrade;
  const verdictColor =
    a.verdict === "ready" ? ansi.green :
    a.verdict === "caution" ? ansi.yellow :
    a.verdict === "concerning" ? ansi.yellow :
    ansi.red;
  const flag = mismatch ? `${ansi.red}MISMATCH${ansi.reset}` : `${ansi.green}match${ansi.reset}`;
  console.log(
    `  framework: detected=${snap.detectedFramework ?? "(none)"}` +
    (snap.expectedFramework
      ? ` ${snap.detectedFramework === snap.expectedFramework ? ansi.green + "✓" : ansi.yellow + "≠"}${ansi.reset}`
      : "")
  );
  console.log(
    `  classification: ${a.classification ?? "(none)"} @ ${Math.round((a.classificationConfidence ?? 0) * 100)}%` +
    `  suppressedRules=${a.suppressedRules}`
  );
  console.log(
    `  verdict: ${verdictColor}${a.verdict}${ansi.reset} (risk ${a.risk}) — predicted ${snap.humanGrade} → [${flag}]`
  );
  console.log(
    `  counts: blockers=${a.blockers} shouldFix=${a.shouldFix} info=${a.informational}` +
    `  pages=${a.pageCount} skipped=${a.skippedUrls}  duration=${(a.durationMs / 1000).toFixed(1)}s`
  );
  if (a.topDrivers.length > 0) {
    console.log(`  ${ansi.dim}top drivers:${ansi.reset}`);
    for (const d of a.topDrivers) {
      console.log(`    · ${d.ruleId} × ${d.count}  (impact ${d.impact}, ${d.severities.join("+")})`);
    }
  }
}

// ----- diff --------------------------------------------------------------

function fmtCell(v: string, w: number): string {
  if (v.length >= w) return v.slice(0, w);
  return v + " ".repeat(w - v.length);
}

function loadSnapshot(path: string): Snapshot | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Snapshot;
  } catch {
    return null;
  }
}

function diff(baseline: Snapshot, current: Snapshot): void {
  console.log(`\n${ansi.bold}===== DIFF: baseline → v0.4.3 =====${ansi.reset}\n`);
  const head = fmtCell("Site", 36) + fmtCell("Before", 22) + fmtCell("After", 22) + "Match?";
  console.log(ansi.bold + head + ansi.reset);
  console.log(ansi.gray + "-".repeat(head.length + 18) + ansi.reset);

  let regressions = 0;
  let mismatchesPostChange = 0;

  const recommendations: string[] = [];

  for (const tgt of current.results) {
    const before = baseline.results.find((b) => b.url === tgt.url);
    const beforeStr = before?.audit
      ? `${before.audit.verdict} (${before.audit.risk})`
      : before?.error
        ? "[errored]"
        : "[absent]";
    const afterStr = tgt.audit
      ? `${tgt.audit.verdict} (${tgt.audit.risk})`
      : tgt.error
        ? "[errored]"
        : "[absent]";

    let matchNote = "";
    let isRegression = false;
    if (tgt.audit && before?.audit) {
      const order = { ready: 0, caution: 1, concerning: 2, critical: 3 } as const;
      if (order[tgt.audit.verdict] > order[before.audit.verdict]) {
        isRegression = true;
        regressions++;
        matchNote = `${ansi.red}REGRESSION (was ${before.audit.verdict})${ansi.reset}`;
      } else if (order[tgt.audit.verdict] < order[before.audit.verdict]) {
        matchNote = `${ansi.green}improved${ansi.reset}`;
      } else {
        matchNote = `${ansi.gray}unchanged${ansi.reset}`;
      }
    } else if (tgt.audit && !before?.audit) {
      matchNote = `${ansi.green}now runs${ansi.reset}`;
    }

    if (tgt.audit) {
      const matchesHuman = tgt.audit.verdict === tgt.humanGrade;
      if (!matchesHuman) {
        mismatchesPostChange++;
        matchNote += `  ${ansi.yellow}!= predicted ${tgt.humanGrade}${ansi.reset}`;
      } else {
        matchNote += `  ${ansi.green}== predicted${ansi.reset}`;
      }
      // Build recommendation if a "ready"-predicted site still scores worse, or a
      // "concerning|critical"-predicted site dropped to ready (we may have over-corrected).
      if (!matchesHuman && tgt.audit.topDrivers.length > 0) {
        const top = tgt.audit.topDrivers[0]!;
        if ((tgt.humanGrade === "ready" && (tgt.audit.verdict === "caution" || tgt.audit.verdict === "concerning" || tgt.audit.verdict === "critical")) ||
            ((tgt.humanGrade === "concerning" || tgt.humanGrade === "critical") && (tgt.audit.verdict === "ready" || tgt.audit.verdict === "caution"))) {
          const profile = tgt.audit.classification ?? tgt.expectedType;
          const direction = tgt.humanGrade === "ready" ? "lower" : "raise";
          const target = tgt.humanGrade === "ready" ? "low" : "high";
          recommendations.push(
            `${tgt.url}: scored ${tgt.audit.verdict}, predicted ${tgt.humanGrade}.\n` +
            `    Top driver: ${top.ruleId} × ${top.count} (impact ${top.impact}).\n` +
            `    Try: ${direction} SCORING_PROFILES["${profile}"].confidenceOverrides["${top.ruleId}"] toward "${target}".`,
          );
        }
      }
    }

    const line = fmtCell(tgt.url.replace(/^https?:\/\//, ""), 36) + fmtCell(beforeStr, 22) + fmtCell(afterStr, 22) + matchNote;
    console.log(isRegression ? ansi.red + line + ansi.reset : line);
  }

  console.log("");
  console.log(`${ansi.bold}Summary:${ansi.reset}`);
  console.log(`  regressions (post-change verdict worse): ${regressions === 0 ? ansi.green + "0" + ansi.reset : ansi.red + regressions + ansi.reset}`);
  console.log(`  mismatches vs humanGrade (post-change):  ${mismatchesPostChange === 0 ? ansi.green + "0" + ansi.reset : ansi.yellow + mismatchesPostChange + ansi.reset}`);

  if (recommendations.length > 0) {
    console.log(`\n${ansi.bold}RECOMMENDATIONS${ansi.reset}`);
    for (const r of recommendations) console.log("  " + r);
  }

  // Validation pass/fail summary, per the spec criteria.
  const readyExpected = current.results.filter((r) => r.humanGrade === "ready");
  const concernedExpected = current.results.filter((r) => r.humanGrade === "concerning" || r.humanGrade === "critical");
  const readyActuallyReady = readyExpected.filter((r) => r.audit?.verdict === "ready").length;
  const concernedStillFlag = concernedExpected.filter(
    (r) => r.audit?.verdict === "concerning" || r.audit?.verdict === "critical",
  ).length;

  console.log(`\n${ansi.bold}Validation${ansi.reset}`);
  console.log(
    `  ready-predicted sites scoring ready:           ${readyActuallyReady}/${readyExpected.length} ` +
    (readyActuallyReady === readyExpected.length ? ansi.green + "PASS" : ansi.red + "FAIL") + ansi.reset,
  );
  console.log(
    `  concerning/critical-predicted still flagging:  ${concernedStillFlag}/${concernedExpected.length} ` +
    (concernedStillFlag === concernedExpected.length ? ansi.green + "PASS" : ansi.red + "FAIL") + ansi.reset,
  );
}

// ----- main --------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isBaseline = args.includes("--baseline");
  const phase: "baseline" | "v0.4.3" = isBaseline ? "baseline" : "v0.4.3";
  const outPath = isBaseline ? BASELINE_PATH : RESULTS_PATH;

  console.log(
    `${ansi.bold}v0.4.3 dogfood — phase=${phase}${ansi.reset}\n` +
    `  targets: ${TARGETS.length}\n` +
    `  sample-size: 5  concurrency: 1  safe-mode: saas  hard-timeout: 60s\n` +
    `  out: ${outPath}\n`,
  );

  const results: AuditSnapshot[] = [];
  for (const target of TARGETS) {
    const snap = await auditOne(target);
    results.push(snap);
    printSnapshot(snap);
    // Best-effort flush after each — partial snapshot survives a crash.
    try {
      writeFileSync(
        outPath,
        JSON.stringify({ capturedAt: new Date().toISOString(), phase, results } satisfies Snapshot, null, 2),
      );
    } catch {
      // ignore — we'll write again at the end.
    }
  }

  const snapshot: Snapshot = { capturedAt: new Date().toISOString(), phase, results };
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\n${ansi.green}Snapshot written:${ansi.reset} ${outPath}`);

  // If we just captured v0.4.3 results AND a baseline exists, diff.
  if (!isBaseline) {
    const baseline = loadSnapshot(BASELINE_PATH);
    if (baseline) {
      diff(baseline, snapshot);
    } else {
      console.log(`\n${ansi.yellow}No baseline found at ${BASELINE_PATH} — skipping diff.${ansi.reset}`);
      console.log(`Run ${ansi.bold}bun run scripts/dogfood-v043.ts --baseline${ansi.reset} first to capture one.`);
    }
  } else {
    console.log(`\n${ansi.dim}Baseline captured. Re-run without --baseline after Agent A + B land their changes.${ansi.reset}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("dogfood failed:", err);
    process.exit(1);
  });
