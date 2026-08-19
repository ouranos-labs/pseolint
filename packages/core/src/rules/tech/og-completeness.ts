import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/og-completeness — flags pages missing the core Open Graph metadata
 * that drives social-share previews and is increasingly used by AI Overviews
 * as a fallback summary signal.
 *
 * Required: og:title, og:description, og:image — plus og:type and og:url,
 * which ogp.me lists among "The four required properties" for every page
 * (https://ogp.me/). ParsedPage.og only carries title/description/image, so
 * og:type and og:url are detected via regex on page.html — and therefore only
 * checked when page.html is non-empty.
 *
 * Severity gradation:
 *   - warning: og:title or og:description is missing (core social-card identity
 *              fields that affect how a link appears in feeds and AI summaries).
 *   - info:    only og:image is missing (cosmetic — the card still has a title
 *              and description; the missing image is low-priority), or the core
 *              three are all present and only og:type / og:url is missing.
 *
 * Presence check: a field is considered MISSING when it is absent, empty, or
 * whitespace-only (value is trimmed before evaluation).
 */

/** True when page.html contains a `<meta property="og:{prop}">` with non-empty content. */
function htmlHasOgProperty(html: string, prop: string): boolean {
  const metaTagRe = /<meta\b[^>]*>/gi;
  for (const [tag] of html.matchAll(metaTagRe)) {
    const propMatch = /\bproperty\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
    const property = (propMatch?.[2] ?? propMatch?.[3] ?? propMatch?.[4] ?? "").trim().toLowerCase();
    if (property !== prop) continue;
    const contentMatch = /\bcontent\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
    const content = contentMatch?.[2] ?? contentMatch?.[3] ?? contentMatch?.[4] ?? "";
    if (content.trim()) return true;
  }
  return false;
}

export function ogCompletenessRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    const missing: string[] = [];
    if (!page.og.title.trim()) missing.push("og:title");
    if (!page.og.description.trim()) missing.push("og:description");
    if (!page.og.image.trim()) missing.push("og:image");
    const missingCore = missing.some((f) => f === "og:title" || f === "og:description");

    // og:type / og:url are only detectable from the raw html (ParsedPage.og
    // doesn't carry them), so skip the aux check when html is empty. Appending
    // them never changes severity: aux-only misses are info, and when core tags
    // are already missing the core-driven severity stands.
    if (page.html) {
      if (!htmlHasOgProperty(page.html, "og:type")) missing.push("og:type");
      if (!htmlHasOgProperty(page.html, "og:url")) missing.push("og:url");
    }
    if (missing.length === 0) continue;

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
