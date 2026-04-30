import type { Confidence, ParsedPage, RuleResult } from "../../types.js";

function hasAuthorSignal(page: ParsedPage): boolean {
  const { metaAuthor, schemaAuthor, bylineElement, relAuthorLink } = page.authorSignals;
  return metaAuthor !== "" || schemaAuthor || bylineElement || relAuthorLink;
}

// Always medium: technical docs, product pages, marketing pages, and pricing pages
// legitimately ship without bylines. Author attribution matters most on blog/news
// content where E-E-A-T is the primary trust signal.
const AUTHOR_CONFIDENCE: Confidence = "medium";
const AUTHOR_CONTEXT_NOTE =
  " Author bylines matter most on blog/news content; technical docs and product pages legitimately omit them.";

export function missingAuthorRule(pages: ParsedPage[]): RuleResult[] {
  const missing = pages.filter((page) => !hasAuthorSignal(page));

  if (missing.length === 0) return [];

  if (missing.length === pages.length && pages.length > 3) {
    return [{
      ruleId: "content/missing-author",
      severity: "warning",
      confidence: AUTHOR_CONFIDENCE,
      message:
        `All ${missing.length} pages have no author signals (meta author, schema author, byline, or rel="author" link). ` +
        `This is a site-wide E-E-A-T risk.${AUTHOR_CONTEXT_NOTE}`,
      fix: `Add author attribution site-wide: <meta name="author" content="Name">, a visible byline, or author data in your JSON-LD schema.`,
      relatedUrls: missing.map((p) => p.url).sort()
    }];
  }

  return missing.map((page) => ({
    ruleId: "content/missing-author",
    severity: "warning" as const,
    confidence: AUTHOR_CONFIDENCE,
    message: `${page.url} has no author signals. This is an E-E-A-T risk.${AUTHOR_CONTEXT_NOTE}`,
    pageUrl: page.url,
    fix: `Add author attribution: <meta name="author" content="Name">, a visible byline, or author data in your JSON-LD schema.`
  }));
}
