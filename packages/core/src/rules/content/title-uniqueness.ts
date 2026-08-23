import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * Heuristic floor for "this template field never got filled in".
 *
 * This is NOT a documented character limit, and deliberately has no upper
 * counterpart. Google's title-link documentation states: "While there's no
 * limit on how long a `<title>` element can be, the title link is truncated in
 * Google Search results as needed, typically to fit the device width." That is
 * display-side cropping measured in pixels, not an indexing or ranking event,
 * so pseolint does not flag long titles at any length (see docs/folklore.md
 * entry #2). What the same page DOES document is that Google may replace the
 * title link "when part of the title text is missing", with `<title>| Site
 * Name</title>` as its own example. A title this short is that shape.
 */
const INCOMPLETE_TITLE_LENGTH = 10;

/**
 * content/title-uniqueness: three checks rolled into one rule:
 *   1. Pages missing a title element (or with empty/whitespace-only titles).
 *   2. Titles short enough to read as an unfilled template field, which is a
 *      documented trigger for Google replacing the title link.
 *   3. Two or more pages sharing the EXACT raw title (templated catalog
 *      titles like "Slack to Google Sheets" vs "Slack to Airtable" are
 *      DIFFERENT raw titles, so this rule does NOT entity-mask: that
 *      would false-positive on every catalog directory in existence).
 *
 * Title is the highest-impact on-page signal Google ranks against. The
 * 2026-05-03 blind-spot audit surfaced it as a tier-1 gap that the
 * existing `content/meta-uniqueness` rule didn't cover (titles ≠ meta
 * descriptions).
 *
 * Every check here maps to a documented reason Google replaces a title link.
 * None of them is a character limit: there is no documented maximum, so this
 * rule has no upper length check and never will.
 * https://developers.google.com/search/docs/appearance/title-link
 */
export function titleUniquenessRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  const titleToPages = new Map<string, ParsedPage[]>();

  for (const page of pages) {
    const title = (page.title ?? "").trim();
    if (title.length === 0) {
      // Diagnostic case: the page has no <head><title>, but an inline SVG
      // <title> (a logo's accessibility label) is the only <title> on the page.
      // Naive extractors used to mis-report that SVG label as the page title.
      if (page.titleSource === "none" && page.svgTitleSample) {
        findings.push({
          ruleId: "content/title-uniqueness",
          severity: "error",
          message: `${page.url} has no <head><title>; the only <title> on the page is an inline SVG <title> ("${page.svgTitleSample}"), which crawlers do NOT use as the page title.`,
          pageUrl: page.url,
          fix: "Add a real <head><title> with the per-record entity. The SVG <title> is decorative/accessibility text and will not appear in search results.",
        });
        continue;
      }
      findings.push({
        ruleId: "content/title-uniqueness",
        severity: "error",
        message: `${page.url} has no <title> element (or its title is empty).`,
        pageUrl: page.url,
        fix: "Add a non-empty <title> element to the page <head>. Title is Google's strongest on-page ranking signal.",
      });
      continue;
    }
    if (title.length < INCOMPLETE_TITLE_LENGTH) {
      findings.push({
        ruleId: "content/title-uniqueness",
        severity: "warning",
        message: `${page.url} has a title of only ${title.length} characters ("${title}"), which reads like a template field that was never filled in.`,
        pageUrl: page.url,
        fix: "Bind the page's own entity into the title. Google documents replacing the title link when part of the title text is missing (its example is the literal \"| Site Name\"), so a near-empty title gets rewritten from the H1 or anchor text. There is no documented upper limit, so nothing here asks you to shorten a title.",
      });
    }

    const arr = titleToPages.get(title) ?? [];
    arr.push(page);
    titleToPages.set(title, arr);
  }

  for (const [title, group] of titleToPages.entries()) {
    if (group.length < 2) continue;
    findings.push({
      ruleId: "content/title-uniqueness",
      severity: "error",
      message: `${group.length} pages share the exact title "${title}".`,
      pageUrl: group[0].url,
      relatedUrls: group.slice(1, 6).map((p) => p.url),
      fix: "Each page needs a unique title that reflects its specific content. Templated titles must include the per-record entity (e.g. include the integration name, currency pair, or city in the title). Google documents repeated boilerplate across a subset of pages as a reason it replaces the title link.",
    });
  }

  return findings;
}
