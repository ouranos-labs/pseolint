import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/og-completeness — flags pages missing the core Open Graph metadata
 * that drives social-share previews and is increasingly used by AI Overviews
 * as a fallback summary signal.
 *
 * Required: og:title, og:description, og:image.
 *
 * The rule was referenced in the v0.4.x README without ever shipping. The
 * 2026-05-03 blind-spot audit surfaced it as a tier-1 gap; this is the
 * v0.5.2 fix.
 */
export function ogCompletenessRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    const missing: string[] = [];
    if (!page.og.title) missing.push("og:title");
    if (!page.og.description) missing.push("og:description");
    if (!page.og.image) missing.push("og:image");
    if (missing.length === 0) continue;
    findings.push({
      ruleId: "tech/og-completeness",
      severity: "warning",
      message: `${page.url} is missing Open Graph tags: ${missing.join(", ")}.`,
      pageUrl: page.url,
      fix: `Add the missing meta tags inside <head>: ${missing.map((tag) => `<meta property="${tag}" content="...">`).join(" ")}.`,
    });
  }
  return findings;
}
