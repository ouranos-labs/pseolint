import type { ParsedPage, RuleResult } from "../../types.js";

export function ogCompletenessRule(pages: ParsedPage[]): RuleResult[] {
  const incomplete: Array<{ url: string; missing: string[] }> = [];

  for (const page of pages) {
    const missing: string[] = [];
    if (!page.og.title) missing.push("og:title");
    if (!page.og.description) missing.push("og:description");
    if (!page.og.image) missing.push("og:image");
    if (missing.length > 0) {
      incomplete.push({ url: page.url, missing });
    }
  }

  if (incomplete.length === 0) return [];

  if (incomplete.length === pages.length && pages.length > 3) {
    const allMissing = new Set(incomplete.flatMap((i) => i.missing));
    return [{
      ruleId: "tech/og-completeness",
      severity: "warning",
      message: `All ${incomplete.length} pages are missing Open Graph tags (${Array.from(allMissing).join(", ")}).`,
      fix: `Add Open Graph tags site-wide: ${Array.from(allMissing).join(", ")}.`,
      relatedUrls: incomplete.map((i) => i.url).sort()
    }];
  }

  return incomplete.map((item) => ({
    ruleId: "tech/og-completeness" as const,
    severity: "warning" as const,
    message: `${item.url} is missing ${item.missing.join(", ")}.`,
    pageUrl: item.url,
    fix: `Add the missing Open Graph tags: ${item.missing.join(", ")}.`
  }));
}
