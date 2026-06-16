import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/og-completeness — flags pages missing the core Open Graph metadata
 * that drives social-share previews and is increasingly used by AI Overviews
 * as a fallback summary signal.
 *
 * Required: og:title, og:description, og:image.
 *
 * Severity gradation:
 *   - warning: og:title or og:description is missing (core social-card identity
 *              fields that affect how a link appears in feeds and AI summaries).
 *   - info:    only og:image is missing (cosmetic — the card still has a title
 *              and description; the missing image is low-priority).
 *
 * Presence check: a field is considered MISSING when it is absent, empty, or
 * whitespace-only (value is trimmed before evaluation).
 */
export function ogCompletenessRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    const missing: string[] = [];
    if (!page.og.title.trim()) missing.push("og:title");
    if (!page.og.description.trim()) missing.push("og:description");
    if (!page.og.image.trim()) missing.push("og:image");
    if (missing.length === 0) continue;

    const missingCore = missing.some((f) => f === "og:title" || f === "og:description");
    const severity: RuleResult["severity"] = missingCore ? "warning" : "info";

    findings.push({
      ruleId: "tech/og-completeness",
      severity,
      confidence: missingCore ? "high" : "medium",
      message: `${page.url} is missing Open Graph tags: ${missing.join(", ")}.`,
      pageUrl: page.url,
      fix: `Add the missing meta tags inside <head>: ${missing.map((tag) => `<meta property="${tag}" content="...">`).join(" ")}.`,
    });
  }
  return findings;
}
