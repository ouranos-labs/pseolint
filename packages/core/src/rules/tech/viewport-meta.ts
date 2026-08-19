import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/viewport-meta — flags pages with no usable `<meta name="viewport">` tag.
 *
 * Google indexes mobile-first, so a page that renders as a shrunken desktop
 * layout on phones is evaluated in exactly that state
 * (https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing),
 * and Lighthouse's SEO audit outright requires a viewport meta tag
 * (https://developer.chrome.com/docs/lighthouse/pwa/viewport).
 *
 * A viewport tag only counts when its content configures a width
 * (contains "width=", e.g. width=device-width); an empty or width-less
 * viewport tag leaves the mobile layout undefined.
 */
export function viewportMetaRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!page.html) continue;

    let hasViewport = false;
    const metaTagRe = /<meta\b[^>]*>/gi;
    for (const [tag] of page.html.matchAll(metaTagRe)) {
      const nameMatch = /\bname\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
      const name = (nameMatch?.[2] ?? nameMatch?.[3] ?? nameMatch?.[4] ?? "").trim().toLowerCase();
      if (name !== "viewport") continue;
      const contentMatch = /\bcontent\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
      const content = (contentMatch?.[2] ?? contentMatch?.[3] ?? contentMatch?.[4] ?? "").toLowerCase();
      if (content.includes("width=")) {
        hasViewport = true;
        break;
      }
    }
    if (hasViewport) continue;

    findings.push({
      ruleId: "tech/viewport-meta",
      severity: "warning",
      confidence: "high",
      message: `${page.url} has no <meta name="viewport"> configuring a width — Google indexes mobile-first, and without a viewport the page renders (and is evaluated) as a shrunken desktop layout on phones.`,
      pageUrl: page.url,
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to <head>.',
    });
  }

  return findings;
}
