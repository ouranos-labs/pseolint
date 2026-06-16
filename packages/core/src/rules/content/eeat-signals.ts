import type { ParsedPage, RuleResult } from "../../types.js";

const EEAT_TEXT_PATTERNS = [
  /last\s+updated/i,
  /last\s+modified/i,
  /reviewed\s+by/i,
  /\bsources:/i,
  /\breferences:/i
];

/**
 * Count how many of the 4 E-E-A-T signal categories the page satisfies.
 *
 * Categories:
 *  1. About-page link — a same-host href containing /about
 *  2. Author identity — any authorSignals field present
 *  3. Published date — page.publishedDate set
 *  4. Transparency text — "sources:", "references:", "last updated", etc.
 *     in page.contentText (NOT raw HTML, to avoid footer/JS false positives)
 *
 * Exported so value-add can reuse this without duplicating logic.
 */
export function countSignalCategories(page: ParsedPage): number {
  let count = 0;

  // 1. About-page: same-host link with /about in the path
  const pageHost = (() => {
    try { return new URL(page.url).host; } catch { return ""; }
  })();
  if (page.resolvedHrefs.some((href) => {
    try {
      const u = new URL(href);
      return u.host === pageHost && /\/about\b/i.test(u.pathname);
    } catch { return false; }
  })) {
    count += 1;
  }

  // 2. Author identity
  const { metaAuthor, schemaAuthor, bylineElement, relAuthorLink } = page.authorSignals;
  if (metaAuthor !== "" || schemaAuthor || bylineElement || relAuthorLink) {
    count += 1;
  }

  // 3. Published date
  if (page.publishedDate) {
    count += 1;
  }

  // 4. Transparency text — check contentText (parsed visible text), not raw HTML
  if (EEAT_TEXT_PATTERNS.some((pattern) => pattern.test(page.contentText))) {
    count += 1;
  }

  return count;
}

export function eeatSignalsRule(pages: ParsedPage[]): RuleResult[] {
  const lacking = pages.filter((page) => countSignalCategories(page) < 2);

  if (lacking.length === 0) return [];

  if (lacking.length === pages.length && pages.length > 3) {
    return [{
      ruleId: "content/eeat-signals",
      severity: "info",
      message: `All ${lacking.length} pages have fewer than 2 out of 4 E-E-A-T signal categories. Site-wide trust signals are missing.`,
      fix: `Add trust signals site-wide: author info, publication dates, about page links, sources, or "last updated" markers.`,
      relatedUrls: lacking.map((p) => p.url).sort()
    }];
  }

  return lacking.map((page) => ({
    ruleId: "content/eeat-signals",
    severity: "info" as const,
    message: `${page.url} has fewer than 2 out of 4 E-E-A-T signal categories.`,
    pageUrl: page.url,
    fix: `Add trust signals: author info, publication dates, about page links, sources, or "last updated" markers.`
  }));
}
