import type { ParsedPage, RuleResult } from "../../types.js";

const EEAT_HTML_PATTERNS = [
  /last\s+updated/i,
  /last\s+modified/i,
  /reviewed\s+by/i,
  /\bsources:/i,
  /\breferences:/i
];

function countSignalCategories(page: ParsedPage): number {
  let count = 0;

  if (page.resolvedHrefs.some((href) => /\/about\b/i.test(href))) {
    count += 1;
  }

  const { metaAuthor, schemaAuthor, bylineElement, relAuthorLink } = page.authorSignals;
  if (metaAuthor !== "" || schemaAuthor || bylineElement || relAuthorLink) {
    count += 1;
  }

  if (page.publishedDate) {
    count += 1;
  }

  if (EEAT_HTML_PATTERNS.some((pattern) => pattern.test(page.html))) {
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
