import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/resource-weight: subresource byte checks from the `--render` pass.
 *
 * Companion to `tech/html-size`, which measures the HTML document only. The
 * limit both rules cite is per FETCHED FILE, so a 2.4 MB bundle.js is
 * truncated exactly like a 2.4 MB HTML document would be: "Googlebot can crawl
 * the first 2MB of a supported file type"
 * (https://developers.google.com/search/docs/crawling-indexing/googlebot).
 * Checking only the HTML while citing that doc was a partial implementation.
 *
 * Findings:
 *   - error   (high):   a single subresource is at or past the 2 MB per-file
 *                       cutoff. Anything after the cutoff is not read.
 *   - warning (medium): a single subresource is within 25% of the cutoff.
 *   - info    (high):   total page weight past the REPORTING floor below, with
 *                       a per-kind breakdown.
 *
 * On the info finding, read the message carefully before copying it into a
 * checklist: Google documents NO total-page-weight and no total-site-size
 * crawl limit. That number is a Core Web Vitals concern, and the finding says
 * so. `TOTAL_REPORT_BYTES` is a reporting floor chosen so the breakdown
 * surfaces on genuinely heavy pages, NOT a threshold anyone published. See
 * docs/folklore.md #4 before turning it into one.
 *
 * Byte totals come from Resource Timing and under-report: `transferSize` is 0
 * for cross-origin responses without Timing-Allow-Origin, which is the common
 * case on asset CDNs. Every number here is a floor, so the rule never escalates
 * on the total alone.
 */

/** Documented Googlebot per-file crawl cutoff (uncompressed). */
const PER_FILE_ERROR_BYTES = 2 * 1024 * 1024;
/** Within 25% of the cutoff: a growing bundle worth watching before it truncates. */
const PER_FILE_WARNING_BYTES = 1.5 * 1024 * 1024;
/** Reporting floor for the diagnostic breakdown. NOT a documented limit. */
const TOTAL_REPORT_BYTES = 5 * 1024 * 1024;

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Trim query strings and long paths so a finding stays readable. */
function shortUrl(url: string): string {
  const bare = url.split("?")[0];
  return bare.length > 80 ? `${bare.slice(0, 77)}...` : bare;
}

export function resourceWeightRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const res = page.resources;
    // No-op outside --render, and on pages whose assets were all opaque.
    if (!res || res.totalBytes <= 0) continue;

    const over = res.largest.filter((r) => r.bytes >= PER_FILE_ERROR_BYTES);
    const near = res.largest.filter(
      (r) => r.bytes >= PER_FILE_WARNING_BYTES && r.bytes < PER_FILE_ERROR_BYTES,
    );

    if (over.length > 0) {
      const list = over.map((r) => `${shortUrl(r.url)} (${mb(r.bytes)}, ${r.kind})`).join("; ");
      findings.push({
        ruleId: "tech/resource-weight",
        severity: "error",
        confidence: "high",
        message: `${page.url} loads ${over.length} resource${over.length === 1 ? "" : "s"} at or past Googlebot's 2 MB per-file crawl cutoff: ${list}. Bytes past the cutoff are never read, so anything defined late in the file (route tables, JSON-LD, lazy imports) is invisible.`,
        pageUrl: page.url,
        fix: `Split or code-split the oversized file so each fetched resource stays under 2 MB. The limit is per file, so several smaller bundles are fine where one large bundle is not.`,
      });
    }

    if (near.length > 0) {
      const list = near.map((r) => `${shortUrl(r.url)} (${mb(r.bytes)}, ${r.kind})`).join("; ");
      findings.push({
        ruleId: "tech/resource-weight",
        severity: "warning",
        confidence: "medium",
        message: `${page.url} loads ${near.length} resource${near.length === 1 ? "" : "s"} within 25% of the 2 MB per-file crawl cutoff: ${list}. Measured via Resource Timing, which under-reports cross-origin assets, so the real size may be higher.`,
        pageUrl: page.url,
        fix: `Budget these files before they cross 2 MB. Tree-shake, split the bundle by route, or move rarely-used code behind a dynamic import.`,
      });
    }

    if (res.totalBytes >= TOTAL_REPORT_BYTES) {
      const parts = Object.entries(res.byKind)
        .filter(([, b]) => b > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([kind, b]) => `${kind} ${mb(b)}`)
        .join(", ");
      findings.push({
        ruleId: "tech/resource-weight",
        severity: "info",
        confidence: "high",
        message: `${page.url} weighs ${mb(res.totalBytes)} across ${res.largest.length >= 10 ? "10+" : String(res.largest.length)} measured resources (${parts}). Google documents no total-page-weight or total-site-size crawl limit, so this is not a crawl-budget finding: it is a Core Web Vitals concern, and it is reported so the weight can be attributed.`,
        pageUrl: page.url,
        fix: `Treat this as a page-experience input, not a crawl limit. Compress and correctly size the dominant kind above, then confirm the change against LCP via tech/core-web-vitals rather than against a byte target.`,
      });
    }
  }

  return findings;
}
