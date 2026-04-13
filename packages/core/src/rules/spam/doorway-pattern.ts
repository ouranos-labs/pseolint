import type { ParsedPage, RuleResult } from "../../types.js";
import type { PairMatch } from "./near-duplicate.js";

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\0${right}` : `${right}\0${left}`;
}

export function doorwayPatternRule(
  nearDuplicatePairs: PairMatch[],
  entitySwapPairs: PairMatch[],
  thinContentUrls: Set<string>,
  pages?: ParsedPage[]
): RuleResult[] {
  const entitySet = new Set(entitySwapPairs.map((pair) => pairKey(pair.leftUrl, pair.rightUrl)));
  const findings: RuleResult[] = [];

  const pageMap = new Map<string, ParsedPage>();
  if (pages) {
    for (const p of pages) {
      pageMap.set(p.url, p);
    }
  }

  for (const pair of nearDuplicatePairs) {
    const key = pairKey(pair.leftUrl, pair.rightUrl);
    if (!entitySet.has(key)) {
      continue;
    }

    const left = pair.leftUrl < pair.rightUrl ? pair.leftUrl : pair.rightUrl;
    const right = pair.leftUrl < pair.rightUrl ? pair.rightUrl : pair.leftUrl;
    const signals: string[] = ["near-duplicate", "entity-swap"];

    const isThin = thinContentUrls.has(left) || thinContentUrls.has(right);
    if (isThin) {
      signals.push("thin-content");
    }

    const leftPage = pageMap.get(left);
    const rightPage = pageMap.get(right);

    if (leftPage && rightPage && leftPage.structureSignature === rightPage.structureSignature) {
      signals.push("identical-structure");
    }

    if (leftPage && rightPage && leftPage.metaDescription && rightPage.metaDescription &&
        leftPage.metaDescription === rightPage.metaDescription) {
      signals.push("identical-meta");
    }

    if (signals.length < 3) {
      continue;
    }

    findings.push({
      ruleId: "spam/doorway-pattern",
      severity: "critical",
      message: `${left} and ${right} match doorway-pattern signals (${signals.join(" + ")}).`,
      relatedUrls: [left, right],
      fix: "This page matches multiple spam signals. Prioritize adding unique, substantive content and differentiating the page structure."
    });
  }

  return findings;
}
