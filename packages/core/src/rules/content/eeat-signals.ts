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

  // 1. About page link
  if (page.resolvedHrefs.some((href) => /\/about\b/i.test(href))) {
    count += 1;
  }

  // 2. Author presence (any of the 4 signals)
  const { metaAuthor, schemaAuthor, bylineElement, relAuthorLink } = page.authorSignals;
  if (metaAuthor !== "" || schemaAuthor || bylineElement || relAuthorLink) {
    count += 1;
  }

  // 3. Publication date
  if (page.publishedDate) {
    count += 1;
  }

  // 4. Last-updated / last-modified / reviewed-by / sources / references
  if (EEAT_HTML_PATTERNS.some((pattern) => pattern.test(page.html))) {
    count += 1;
  }

  return count;
}

export function eeatSignalsRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const count = countSignalCategories(page);
    if (count < 2) {
      findings.push({
        ruleId: "content/eeat-signals",
        severity: "info",
        message: `${page.url} has only ${count} out of 4 E-E-A-T signal categories. Consider adding author info, about page links, publication dates, or cited sources.`,
        pageUrl: page.url,
        fix: "Add trust signals: author info, publication dates, about page links, sources, or \"last updated\" markers."
      });
    }
  }

  return findings;
}
