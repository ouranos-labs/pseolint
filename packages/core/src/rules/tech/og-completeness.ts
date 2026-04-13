import type { ParsedPage, RuleResult } from "../../types.js";

export function ogCompletenessRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const missing: string[] = [];
    if (!page.og.title) {
      missing.push("og:title");
    }
    if (!page.og.description) {
      missing.push("og:description");
    }
    if (!page.og.image) {
      missing.push("og:image");
    }

    if (missing.length === 0) {
      continue;
    }

    findings.push({
      ruleId: "tech/og-completeness",
      severity: "warning",
      message: `${page.url} is missing ${missing.join(", ")}.`,
      pageUrl: page.url
    });
  }

  return findings;
}
