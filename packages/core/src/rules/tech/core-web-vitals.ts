import type { ParsedPage, RuleResult } from "../../types.js";

// Google's "poor" thresholds — the tier that actively hurts rankings.
// https://web.dev/articles/vitals — good ≤ first / poor > second.
const LCP_POOR_MS = 4000; // good ≤ 2500
const CLS_POOR = 0.25; // good ≤ 0.1
const INP_POOR_MS = 500; // good ≤ 200

/**
 * Flags pages whose Core Web Vitals land in Google's "poor" tier.
 *
 * Prefers CrUX field data (page.fieldVitals) when a CrUX API key was supplied —
 * that's the real-user p75 Google ranks on, and the only source of INP. Falls
 * back to the lab render (page.webVitals, LCP/CLS only) when no field data is
 * available. No-op when neither is present.
 *
 * ponytail: field data closes the "not CrUX" and "no INP" gaps of the lab-only
 * path. Lab remains the zero-dependency default; field is opt-in (--crux).
 */
export function coreWebVitalsRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    const field = page.fieldVitals;
    const lab = page.webVitals;

    // Field data wins — it's what Google actually scores, and carries INP.
    const lcp = field ? field.lcp : lab?.lcp ?? null;
    const cls = field ? field.cls : lab?.cls ?? null;
    const inp = field ? field.inp : null; // INP is field-only
    if (!field && !lab) continue;

    const badLcp = lcp !== null && lcp > LCP_POOR_MS;
    const badCls = cls !== null && cls > CLS_POOR;
    const badInp = inp !== null && inp > INP_POOR_MS;
    if (!badLcp && !badCls && !badInp) continue;

    const parts: string[] = [];
    if (badLcp) parts.push(`LCP ${Math.round(lcp as number)}ms (poor > ${LCP_POOR_MS}ms)`);
    if (badCls) parts.push(`CLS ${(cls as number).toFixed(3)} (poor > ${CLS_POOR})`);
    if (badInp) parts.push(`INP ${Math.round(inp as number)}ms (poor > ${INP_POOR_MS}ms)`);

    const provenance = field
      ? field.source === "url"
        ? "CrUX field data (real-user p75)"
        : "CrUX field data (origin-level p75 — this URL has too little traffic for its own field data)"
      : "lab measurement under headless Chromium — confirm against field data before prioritizing";

    const fixes: string[] = [];
    if (badLcp) fixes.push("cut LCP: compress/preload the hero image or web font, remove render-blocking CSS/JS, serve the largest element in the initial HTML");
    if (badCls) fixes.push("eliminate layout shift: set explicit width/height (or aspect-ratio) on images/embeds and reserve space for late-loading banners/ads");
    if (badInp) fixes.push("cut INP: break up long tasks, defer non-critical JS, and avoid heavy synchronous work on click/tap/keypress handlers");

    findings.push({
      ruleId: "tech/core-web-vitals",
      severity: "warning",
      confidence: field ? "high" : "medium",
      pageUrl: page.url,
      message: `${page.url} fails Core Web Vitals: ${parts.join(", ")}. Source: ${provenance}.`,
      fix: `${fixes.join("; ")}.`,
    });
  }
  return findings;
}
