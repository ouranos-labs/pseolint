import type { ParsedPage, RuleResult } from "../../types.js";

function hasAuthorSignal(page: ParsedPage): boolean {
  const { metaAuthor, schemaAuthor, bylineElement, relAuthorLink } = page.authorSignals;
  return metaAuthor !== "" || schemaAuthor || bylineElement || relAuthorLink;
}

export function missingAuthorRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!hasAuthorSignal(page)) {
      findings.push({
        ruleId: "content/missing-author",
        severity: "warning",
        message: `${page.url} has no author signals (meta author, schema author, byline, or rel="author" link). This is an E-E-A-T risk.`,
        pageUrl: page.url,
        fix: `Add author attribution: <meta name="author" content="Name">, a visible byline, or author data in your JSON-LD schema.`
      });
    }
  }

  return findings;
}
