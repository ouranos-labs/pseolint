import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";
import { extractPageFacts, DEFAULT_CITATION_ALLOWLIST } from "../../algorithms/fact-extraction.js";

export interface CitationCoverageOptions {
  /** Quantified-claim count at/above which an authoritative citation is expected. Default: 4. */
  minClaims?: number;
  /** Authoritative citations below which the rule fires (when claims >= minClaims). Default: 1. */
  minAuthoritative?: number;
  /** Extra authoritative domains, merged with the extractor default allowlist. */
  allowlist?: readonly string[];
}

export function citationCoverageRule(
  pages: ParsedPage[],
  entityPatterns: EntityMaskPattern[],
  options?: CitationCoverageOptions,
): RuleResult[] {
  const minClaims = options?.minClaims ?? 4;
  const minAuthoritative = options?.minAuthoritative ?? 1;
  // Merge caller-supplied domains with the default allowlist (additive, per the
  // option contract) rather than replacing it.
  const allowlist = options?.allowlist
    ? [...DEFAULT_CITATION_ALLOWLIST, ...options.allowlist]
    : undefined;
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const facts = extractPageFacts(page, entityPatterns, allowlist);
    // "Quantified claims": distinct numeric facts + measurements + grounded claims.
    const quantified = new Set<string>([
      ...facts.citableFacts,
      ...facts.measurements.map((m) => m.value),
    ]);
    const statClaims = quantified.size + facts.groundedClaims.length;
    const authoritative = facts.citations.filter((c) => c.authority === "authoritative").length;

    if (statClaims < minClaims) continue;
    if (authoritative >= minAuthoritative) continue;

    const entityNames = facts.namedEntities.slice(0, 4).map((e) => e.value).join(", ");
    const entityNote = entityNames ? ` (${facts.namedEntities.length} named entities: ${entityNames})` : "";

    findings.push({
      ruleId: "content/citation-coverage",
      severity: "warning",
      // Low in general; the grounded-claim portion is speculative. A page can
      // legitimately make claims without citing (opinion, first-party data).
      confidence: "low",
      message:
        `${page.url} makes ${statClaims} quantified claim${statClaims === 1 ? "" : "s"} ` +
        `but cites ${authoritative} authoritative source${authoritative === 1 ? "" : "s"}${entityNote}.`,
      pageUrl: page.url,
      fix:
        "Cite the primary sources behind your numbers: link the statute, standard, dataset, " +
        ".gov/.edu page, or research that backs each statistic. AI Overviews and Google's " +
        "helpful-content systems weight pages that ground claims in authoritative references. " +
        "Note: this rule detects statistic+citation co-occurrence, not semantic correctness.",
    });
  }

  return findings;
}
