import { load } from "cheerio";
import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * tech/viewport-meta flags pages with no usable `<meta name="viewport">` tag.
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
 *
 * Parsed with cheerio rather than regexes over the raw HTML. A commented-out
 * tag (`<!-- <meta name="viewport" content="width=device-width"> -->`) is a
 * comment node, so a genuinely non-responsive page is still reported instead of
 * being waved through by markup the browser never sees.
 */
export function viewportMetaRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!page.html) continue;

    // Metadata names are ASCII case-insensitive, so fold before comparing.
    const hasViewport = load(page.html)("meta")
      .toArray()
      .some(
        (el) =>
          (el.attribs?.name ?? "").trim().toLowerCase() === "viewport" &&
          (el.attribs?.content ?? "").toLowerCase().includes("width="),
      );
    if (hasViewport) continue;

    findings.push({
      ruleId: "tech/viewport-meta",
      severity: "warning",
      confidence: "high",
      message: `${page.url} has no <meta name="viewport"> configuring a width. Google indexes mobile-first, and without a viewport the page renders (and is evaluated) as a shrunken desktop layout on phones.`,
      pageUrl: page.url,
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to <head>.',
    });
  }

  return findings;
}
