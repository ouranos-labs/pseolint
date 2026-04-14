import type { ParsedPage, RuleResult } from "../../types.js";

export function robotsNoindexConflictRule(
  pages: ParsedPage[],
  inbound: Map<string, number>
): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const htmlRobots = page.robotsMeta.toLowerCase();
    const httpRobots = (page.httpMeta?.xRobotsTag ?? "").toLowerCase();
    const isNoindex = htmlRobots.includes("noindex") || httpRobots.includes("noindex");
    if (!isNoindex) {
      continue;
    }

    const source = htmlRobots.includes("noindex") && httpRobots.includes("noindex")
      ? "both HTML meta and X-Robots-Tag"
      : htmlRobots.includes("noindex")
        ? "HTML meta"
        : "X-Robots-Tag header";

    const inboundCount = inbound.get(page.url) ?? 0;
    findings.push({
      ruleId: "tech/robots-noindex-conflict",
      severity: inboundCount > 0 ? "warning" : "info",
      message:
        inboundCount > 0
          ? `${page.url} is marked noindex (via ${source}) but has ${inboundCount} inbound internal links.`
          : `${page.url} is marked noindex (via ${source}).`,
      pageUrl: page.url,
      fix: inboundCount > 0
        ? "Either remove noindex or remove internal links pointing to this page."
        : "Verify this page should be noindexed."
    });
  }

  return findings;
}
