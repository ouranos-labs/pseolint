import type { ParsedPage, RuleResult } from "../../types.js";

const SOFT_404_PATTERNS = /\b(not\s*found|404|page\s*missing|does\s*not\s*exist|no\s*longer\s*available)\b/i;

export function soft404Rule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!page.httpMeta) continue;
    if (page.httpMeta.statusCode !== 200) continue;

    const wordCount = page.contentText.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 50) continue;

    if (SOFT_404_PATTERNS.test(page.title)) {
      findings.push({
        ruleId: "tech/soft-404",
        severity: "error",
        message: `${page.url} returns HTTP 200 but appears to be an error page (title: "${page.title}", ${wordCount} words).`,
        pageUrl: page.url,
        fix: "Return a proper HTTP 404 status code for error pages instead of 200."
      });
    }
  }

  return findings;
}
