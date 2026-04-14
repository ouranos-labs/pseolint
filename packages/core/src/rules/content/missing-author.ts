import type { ParsedPage, RuleResult } from "../../types.js";

function hasAuthorSignal(page: ParsedPage): boolean {
  const { metaAuthor, schemaAuthor, bylineElement, relAuthorLink } = page.authorSignals;
  return metaAuthor !== "" || schemaAuthor || bylineElement || relAuthorLink;
}

export function missingAuthorRule(pages: ParsedPage[]): RuleResult[] {
  const missing = pages.filter((page) => !hasAuthorSignal(page));

  if (missing.length === 0) return [];

  if (missing.length === pages.length && pages.length > 3) {
    return [{
      ruleId: "content/missing-author",
      severity: "warning",
      message: `All ${missing.length} pages have no author signals (meta author, schema author, byline, or rel="author" link). This is a site-wide E-E-A-T risk.`,
      fix: `Add author attribution site-wide: <meta name="author" content="Name">, a visible byline, or author data in your JSON-LD schema.`,
      relatedUrls: missing.map((p) => p.url).sort()
    }];
  }

  return missing.map((page) => ({
    ruleId: "content/missing-author",
    severity: "warning" as const,
    message: `${page.url} has no author signals. This is an E-E-A-T risk.`,
    pageUrl: page.url,
    fix: `Add author attribution: <meta name="author" content="Name">, a visible byline, or author data in your JSON-LD schema.`
  }));
}
