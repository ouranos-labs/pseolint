import type { ParsedPage, RuleResult } from "../../types.js";

// Google's "poor" thresholds — the tier that actively hurts rankings.
// https://web.dev/articles/vitals — good ≤ first / poor > second.
const LCP_POOR_MS = 4000; // good ≤ 2500
const CLS_POOR = 0.25; // good ≤ 0.1

/**
 * Flags pages whose Core Web Vitals land in Google's "poor" tier during a
 * rendered audit. Requires --render (no-op when page.webVitals is absent).
 *
 * ponytail: measured from a headless-Chromium lab snapshot (LCP/CLS to
 * networkidle), not CrUX field data — so it catches egregious regressions
 * (a 6s hero image, a layout that jumps 0.4) but won't match the number in
 * Search Console. It only fires on the "poor" tier to keep lab noise out of
 * the verdict; "needs improvement" is reported in the message, not flagged.
 */
export function coreWebVitalsRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    const v = page.webVitals;
    if (!v) continue;

    const badLcp = v.lcp !== null && v.lcp > LCP_POOR_MS;
    const badCls = v.cls !== null && v.cls > CLS_POOR;
    if (!badLcp && !badCls) continue;

    const parts: string[] = [];
    if (badLcp) parts.push(`LCP ${Math.round(v.lcp as number)}ms (poor > ${LCP_POOR_MS}ms)`);
    if (badCls) parts.push(`CLS ${(v.cls as number).toFixed(3)} (poor > ${CLS_POOR})`);

    findings.push({
      ruleId: "tech/core-web-vitals",
      severity: "warning",
      confidence: "medium",
      pageUrl: page.url,
      message:
        `${page.url} fails Core Web Vitals: ${parts.join(", ")}. ` +
        `Lab measurement under headless Chromium — confirm against field data (PageSpeed Insights / Search Console) before prioritizing.`,
      fix: badLcp && badCls
        ? "Reduce LCP (optimize the hero image/font, preload the LCP resource) and reserve space for shifting elements (set width/height on images, avoid injecting content above the fold)."
        : badLcp
          ? "Optimize the largest element: compress/preload the hero image or web font, cut render-blocking CSS/JS, and serve it from the initial HTML."
          : "Eliminate layout shift: set explicit width/height (or aspect-ratio) on images and embeds, and reserve space for late-loading banners/ads.",
    });
  }
  return findings;
}
