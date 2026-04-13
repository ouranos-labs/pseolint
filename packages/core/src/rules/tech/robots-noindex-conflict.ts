import type { ParsedPage, RuleResult } from "../../types.js";

export function robotsNoindexConflictRule(
  pages: ParsedPage[],
  inbound: Map<string, number>
): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const robots = page.robotsMeta.toLowerCase();
    if (!robots.includes("noindex")) {
      continue;
    }

    const inboundCount = inbound.get(page.url) ?? 0;
    findings.push({
      ruleId: "tech/robots-noindex-conflict",
      severity: inboundCount > 0 ? "warning" : "info",
      message:
        inboundCount > 0
          ? `${page.url} is marked noindex but still has ${inboundCount} inbound internal links.`
          : `${page.url} is marked noindex.`,
      pageUrl: page.url,
      fix: inboundCount > 0
        ? "Either remove noindex or remove internal links pointing to this page."
        : "Verify this page should be noindexed."
    });
  }

  return findings;
}
