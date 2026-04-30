/**
 * v0.4.2 dogfood — test the new framework detector + audit engine against
 * a few well-resourced real-world sites. ONE audit per site, hard 3-page
 * sample cap, saas safe mode (guardSsrf + tighter byte caps + robots.txt
 * honoured). Designed to verify v0.4.2 features against real responses
 * without abusing third-party origins.
 *
 * Targets are chosen for high traffic capacity (their CDNs absorb a 3-page
 * audit trivially) and known framework identity:
 *   - https://nextjs.org   → framework detector should report "nextjs"
 *   - https://wordpress.com → expect "wordpress" (or no detection if their
 *     headers don't include x-powered-by — they sometimes strip them)
 *   - https://www.shopify.com → expect "shopify"
 *
 * Usage:
 *   bun run scripts/dogfood-v042.ts
 *
 * Output: JSON-line per site with framework detection result + audit
 * verdict + classification + finding counts. Total runtime ~3-5 minutes.
 */

import { detectFrameworkFromUrl } from "../apps/web/src/lib/audit-defaults.js";
import { auditSource } from "../packages/core/src/index.js";

interface TargetResult {
  url: string;
  expectedFramework: string;
  detectedFramework: string | undefined;
  frameworkMatch: boolean;
  audit: null | {
    verdict: string;
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
  };
  error?: string;
}

const TARGETS: Array<{ url: string; expected: string }> = [
  { url: "https://nextjs.org", expected: "nextjs" },
  { url: "https://wordpress.com", expected: "wordpress" },
  { url: "https://www.shopify.com", expected: "shopify" },
];

async function dogfoodOne(target: { url: string; expected: string }): Promise<TargetResult> {
  const result: TargetResult = {
    url: target.url,
    expectedFramework: target.expected,
    detectedFramework: undefined,
    frameworkMatch: false,
    audit: null,
  };

  // Step 1: framework detection (5s cap)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      result.detectedFramework = await detectFrameworkFromUrl(target.url, ctrl.signal);
    } finally {
      clearTimeout(timer);
    }
    result.frameworkMatch = result.detectedFramework === target.expected;
  } catch (err) {
    result.error = `framework-detect failed: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  // Step 2: tiny audit. saas mode + 3-page sample. No AI. No render.
  // The fundamental v0.4.2 features we're testing here are the engine
  // page-skip filters and template bucketing — neither needs the full
  // hosted-form pipeline.
  const start = Date.now();
  try {
    const summary = await auditSource(target.url, {
      sampleSize: 3,
      safeMode: "saas",
      // Turn ON the new filters so we see whether they fire on real sites.
      // Cookie/auth/search-result pages are common on every site we're
      // hitting — this is the chance to verify zero false-positives at scale.
      respectNoindex: true,
      skipDetectedAuth: true,
      skipBoilerplate: true,
      skipSearchPages: true,
      skipEmptyBody: true,
    });
    result.audit = {
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
    };
  } catch (err) {
    result.error = `audit failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return result;
}

async function main(): Promise<void> {
  console.log("v0.4.2 dogfood — single audit per site, 3-page sample, saas safe mode\n");
  const results: TargetResult[] = [];

  // Sequential — one site at a time, so we never have two outbound audits in flight.
  for (const target of TARGETS) {
    console.log(`▸ ${target.url} (expected framework: ${target.expected})`);
    const r = await dogfoodOne(target);
    results.push(r);
    if (r.error) {
      console.log(`  ✗ ${r.error}\n`);
      continue;
    }
    const fwIcon = r.frameworkMatch ? "✓" : (r.detectedFramework ? "≠" : "✗");
    console.log(`  ${fwIcon} framework: detected=${r.detectedFramework ?? "(none)"}, expected=${r.expectedFramework}`);
    if (r.audit) {
      console.log(`  ✓ audit: verdict=${r.audit.verdict} risk=${r.audit.risk} pages=${r.audit.pageCount} blockers=${r.audit.blockers} shouldFix=${r.audit.shouldFix} skipped=${r.audit.skippedUrls}`);
      console.log(`     classification=${r.audit.classification ?? "(none)"} (${Math.round((r.audit.classificationConfidence ?? 0) * 100)}%) suppressed=${r.audit.suppressedRules}`);
      console.log(`     duration=${(r.audit.durationMs / 1000).toFixed(1)}s\n`);
    }
  }

  console.log("===== SUMMARY =====");
  console.log(JSON.stringify(results, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("dogfood failed:", err);
    process.exit(1);
  });
